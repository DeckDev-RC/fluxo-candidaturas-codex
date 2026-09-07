// Classifica o pedido da pessoa antes do turno para duas decisões locais:
// quanto contexto do app entra no turno e com que esforço de raciocínio a IA trabalha.
//
// Um pedido de navegação ("veja quem quer se conectar", "mande mensagem para X",
// "abra o LinkedIn") não precisa de metas, fila, currículo e lacunas no contexto: isso
// só disputa atenção com a página. E é onde o modelo mais erra por pensar pouco,
// então o esforço sobe para "high" quando a configuração da pessoa está abaixo.

const NAVEGACAO = /\b(abr[aie]r?|abra|entre?|acess[ea]r?|naveg[ua]e?r?|v[áa] (para|em|no|na)|veja|ver|olh[ea]r?|confira|conferir|cliqu[ea]r?|clica|rol[ea]r?|digit[ea]r?|aceit[ea]r? (o |os )?convites?|recus[ea]r? (o |os )?convites?|conect[ea]r?|sig[ao]|seguir|curt[ai]r?|coment[ea]r?|leia|ler|analis[ea]r?( o| a)? (perfil|p[áa]gina|mensagem)|mensagem|mensagens|convite|convites|conex[ãa]o|conex[õo]es|notifica[çc][õo]es|perfil de|p[áa]gina|site|aba|linkedin|infojobs|gupy|catho|vagas\.com|sol[ií]des|recrutador|recrutadora)\b/i;
// Calibrado nos 61 turnos reais gravados até 07/09/2026: "vaga" em qualquer forma,
// "procure"/"busque", "aplique", o próprio app e sua configuração são campanha, mesmo
// quando a frase também fala em abrir uma plataforma ("abre o linkedin e procure uma vaga").
const CAMPANHA = /\b(vagas?|busc\w*|procur\w*|encontr[ea]r? vagas?|candidat\w*|apli(?:car|que|ca)|inscrever|fila|lista de vagas|meta|metas|campanha|curr[íi]culo|ader[êe]ncia|descart\w*|preencher|hist[óo]rico|\bapp\b|aplicativo|configur\w*|config|continue a busca|continuar a busca|come[çc]ar|come[çc]e|iniciar)\b/i;
// Saudação e conversa solta nunca viram navegação, nem como continuação: a IA precisa da
// situação inteira para responder "o que eu faço?".
const SAUDACAO = /^(oi+|ol[áa]|ola|opa|e a[íi]|bom dia|boa tarde|boa noite|tudo bem\??|obrigad[oa]|valeu)[!.,\s]*$/i;
// "Entrei", "loguei", "pronto": a pessoa avisa que o login acabou. Nos turnos reais, o
// que vem depois é a campanha (buscar, aplicar), então o contexto inteiro volta.
const LOGIN_FEITO = /\b(entrei|loguei|logad[oa]|autentiquei|pronto|j[áa] (estou|to|tô) (dentro|logad[oa]|conectad[oa])|pode continuar|pode seguir)\b/i;
const CONTINUACAO_CURTA = 120;

export function classificarPedido(texto, { ultimoTurnoNavegou = false } = {}) {
  const pedido = String(texto ?? '').trim();
  if (!pedido) return { navegador: false, motivo: 'vazio' };
  if (SAUDACAO.test(pedido)) return { navegador: false, motivo: 'saudacao' };
  if (LOGIN_FEITO.test(pedido) && !NAVEGACAO.test(pedido)) return { navegador: false, motivo: 'login' };
  if (CAMPANHA.test(pedido)) return { navegador: false, motivo: 'campanha' };
  if (NAVEGACAO.test(pedido)) return { navegador: true, motivo: 'navegacao' };
  // "sim", "pode enviar", "manda", "o segundo": continuação curta de um trabalho no navegador.
  if (ultimoTurnoNavegou && pedido.length <= CONTINUACAO_CURTA) return { navegador: true, motivo: 'continuacao' };
  return { navegador: false, motivo: 'geral' };
}

// Um turno "foi de navegador" quando usou a página e não a campanha. fluxo_state e
// fluxo_profile são leituras neutras (a IA as chama em quase todo turno) e não contam.
const FERRAMENTA_DE_NAVEGADOR = /^(browser_|fluxo_browser_|fluxo_open_platform$)/;
const FERRAMENTA_DE_CAMPANHA = /^fluxo_(discover|prepare|fill|submit|reconcile|shortlist|read_job|discard|campaign|schedule|read_resume|record_gap|followup|codex_settings|export)$/;

export function turnoFoiDeNavegador(ferramentas = []) {
  const nomes = [...ferramentas].map(String);
  return nomes.some((nome) => FERRAMENTA_DE_NAVEGADOR.test(nome)) && !nomes.some((nome) => FERRAMENTA_DE_CAMPANHA.test(nome));
}

// Esforço de raciocínio para um turno de navegador: sobe até "high" quando a
// configuração está abaixo e o modelo aceita; nunca desce o que a pessoa escolheu.
const ORDEM = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export const ESFORCO_NAVEGADOR = 'high';

export function esforcoParaNavegador(configuracao = {}, catalogo = []) {
  const atual = String(configuracao.effort ?? 'medium').toLowerCase();
  if (ORDEM.indexOf(atual) >= ORDEM.indexOf(ESFORCO_NAVEGADOR)) return '';
  const modelo = String(configuracao.model ?? '').trim();
  const entrada = (Array.isArray(catalogo) ? catalogo : []).find((item) => item.id === modelo);
  if (entrada?.efforts?.length && !entrada.efforts.includes(ESFORCO_NAVEGADOR)) return '';
  return ESFORCO_NAVEGADOR;
}
