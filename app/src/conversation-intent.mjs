// Classifica o pedido da pessoa antes do turno para duas decisões locais:
// quanto contexto do app entra no turno e com que esforço de raciocínio a IA trabalha.
//
// Um pedido de navegação ("veja quem quer se conectar", "mande mensagem para X",
// "abra o LinkedIn") não precisa de metas, fila, currículo e lacunas no contexto: isso
// só disputa atenção com a página. E é onde o modelo mais erra por pensar pouco,
// então o esforço sobe para "high" quando a configuração da pessoa está abaixo.

const NAVEGACAO = /\b(abr[aie]r?|abra|entre?|acess[ea]r?|naveg[ua]e?r?|v[áa] (para|em|no|na)|veja|ver|olh[ea]r?|confira|conferir|cliqu[ea]r?|clica|rol[ea]r?|digit[ea]r?|aceit[ea]r? (o |os )?convites?|recus[ea]r? (o |os )?convites?|conect[ea]r?|sig[ao]|seguir|curt[ai]r?|coment[ea]r?|leia|ler|analis[ea]r?( o| a)? (perfil|p[áa]gina|mensagem)|mensagem|mensagens|convite|convites|conex[ãa]o|conex[õo]es|notifica[çc][õo]es|perfil de|p[áa]gina|site|aba|linkedin|infojobs|gupy|catho|vagas\.com|sol[ií]des|recrutador|recrutadora)\b/i;
const CAMPANHA = /\b(busc[ae]r? vagas?|buscar|procur[ea]r? vagas?|encontr[ea]r? vagas?|candidat\w*|aplicar|inscrever|fila|meta|metas|campanha|curr[íi]culo|ader[êe]ncia|descart\w*|preparar (a )?vaga|preencher|enviar (a )?candidatura|continue a busca|continuar a busca|come[çc]ar|iniciar)\b/i;
const CONTINUACAO_CURTA = 120;

export function classificarPedido(texto, { ultimoTurnoNavegou = false } = {}) {
  const pedido = String(texto ?? '').trim();
  if (!pedido) return { navegador: false, motivo: 'vazio' };
  if (CAMPANHA.test(pedido)) return { navegador: false, motivo: 'campanha' };
  if (NAVEGACAO.test(pedido)) return { navegador: true, motivo: 'navegacao' };
  // "sim", "pode enviar", "manda", "o segundo": continuação curta de um trabalho no navegador.
  if (ultimoTurnoNavegou && pedido.length <= CONTINUACAO_CURTA) return { navegador: true, motivo: 'continuacao' };
  return { navegador: false, motivo: 'geral' };
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
