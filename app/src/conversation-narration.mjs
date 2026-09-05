// Cada chamada de ferramenta do agente vira uma frase curta para a pessoa ler,
// sem segredo, sem HTML e sem vocabulário de implementação. Quando a ferramenta
// devolve algo que exige a pessoa (login, desafio, revisão), a narração também
// produz o evento de espera.

const NOMES = { GUPY: 'Gupy', INFOJOBS: 'InfoJobs', PANDAPE: 'PandaPé', LINKEDIN: 'LinkedIn', CATHO: 'Catho', VAGASCOM: 'Vagas.com', SOLIDES: 'Sólides' };
const plataforma = (valor) => NOMES[String(valor ?? '').toUpperCase()] ?? String(valor ?? 'a plataforma');

export function resumirFerramenta({ tool, arguments: args = {}, ok, result, error }) {
  const inicio = INICIO[tool]?.(args) ?? 'Executando uma etapa.';
  if (ok === undefined) return { inicio, fim: '', espera: null };
  if (ok === false) return { inicio, fim: `Não deu certo: ${String(error?.message ?? 'falha na etapa').replace(/\.+$/, '')}.`, espera: null };
  const fim = FIM[tool]?.(args, result ?? {}) ?? { texto: 'Etapa concluída.' };
  return { inicio, fim: fim.texto, espera: fim.espera ?? null };
}

const INICIO = {
  fluxo_state: () => 'Lendo o estado atual da campanha.',
  fluxo_profile: () => 'Lendo os dados confirmados do seu perfil.',
  fluxo_import_resume: (a) => `Importando o currículo ${a.filename ?? ''}.`.replace(' .', '.'),
  fluxo_read_resume: () => 'Lendo o seu currículo.',
  fluxo_record_gap: (a) => `Guardando a resposta sobre ${rotuloFato(a.key)}.`,
  fluxo_attach_resume: () => 'Registrando o currículo que será usado.',
  fluxo_open_platform: (a) => `Abrindo ${plataforma(a.platform)} na aba do navegador.`,
  fluxo_browser_status: () => 'Conferindo as abas do navegador.',
  fluxo_discover: (a) => `Buscando vagas em ${plataforma(a.platform)}.`,
  fluxo_shortlist: () => 'Comparando as vagas encontradas com os seus dados confirmados.',
  fluxo_prepare: () => 'Abrindo a vaga escolhida e o formulário de candidatura.',
  fluxo_fill: () => 'Preenchendo o formulário só com dados confirmados.',
  fluxo_review: () => 'Preparando a revisão para a sua aprovação.',
  fluxo_submit: () => 'Enviando a candidatura aprovada.',
  fluxo_reconcile: () => 'Conferindo o resultado do envio na plataforma.',
  fluxo_followup: () => 'Consultando novidades das suas candidaturas.'
};

const FIM = {
  fluxo_state: () => ({ texto: 'Estado lido.' }),
  fluxo_profile: () => ({ texto: 'Perfil lido.' }),
  fluxo_import_resume: (a, r) => ({ texto: r.extraction?.ok === false ? `Currículo transferido, mas sem texto legível: ${r.extraction.pending ?? 'não foi possível ler'}.` : `Currículo ${r.filename ?? ''} lido.`.replace(' lido', ' lido') }),
  fluxo_read_resume: (a, r) => { const n = Object.keys(r.recognized ?? {}).length; return { texto: n ? `Currículo lido; reconheci ${n} dado(s) para você confirmar.` : 'Currículo lido.' }; },
  fluxo_record_gap: (a) => ({ texto: `${rotuloFato(a.key)} confirmado no seu perfil.` }),
  fluxo_attach_resume: () => ({ texto: 'Currículo registrado.' }),
  fluxo_open_platform: (a, r) => {
    const nome = plataforma(a.platform);
    if (r.challenge) return { texto: `${nome} pediu uma verificação (${r.challenge === 'captcha' ? 'CAPTCHA' : r.challenge === 'mfa' ? 'código de verificação' : 'biometria'}).`, espera: { kind: 'challenge', platform: String(a.platform).toUpperCase(), challenge: r.challenge } };
    if (r.loginPending) return { texto: `${nome} está aberto e pede login.`, espera: { kind: 'login', platform: String(a.platform).toUpperCase(), url: r.url } };
    return { texto: `${nome} aberto; você já está conectado.` };
  },
  fluxo_browser_status: (a, r) => ({ texto: `${(r.tabs ?? []).length} aba(s) aberta(s).` }),
  fluxo_discover: (a, r) => {
    const criadas = Array.isArray(r.created) ? r.created.length : Number(r.createdCount ?? r.count ?? 0);
    const falhas = Array.isArray(r.failures) ? r.failures : [];
    if (falhas.length && !criadas) return { texto: `Não consegui ler a busca em ${plataforma(a.platform)}: ${falhas[0].message ?? 'página não suportada'}.` };
    return { texto: `${criadas} vaga(s) nova(s) observada(s) em ${plataforma(a.platform)}.` };
  },
  fluxo_shortlist: (a, r) => ({ texto: `${(r.items ?? r.shortlist ?? []).length} vaga(s) elegível(is) após a comparação.` }),
  fluxo_prepare: (a, r) => ({ texto: `Formulário aberto para ${r.item?.role ?? 'a vaga'} em ${r.item?.company ?? 'empresa não informada'}.` }),
  fluxo_fill: () => ({ texto: 'Campos preenchidos com dados confirmados.' }),
  fluxo_review: (a, r) => ({ texto: 'Revisão pronta: aprove ou rejeite o envio.', espera: { kind: 'approval', approvalId: r.id ?? r.approval?.id ?? '' } }),
  fluxo_submit: (a, r) => ({ texto: r.confirmed === false ? 'A plataforma não confirmou o recebimento.' : 'A plataforma confirmou o recebimento da candidatura.' }),
  fluxo_reconcile: () => ({ texto: 'Resultado do envio conferido.' }),
  fluxo_followup: (a, r) => ({ texto: `${(r.newEvents ?? []).length} novidade(s) nas candidaturas.` })
};

const FATOS = { name: 'Nome', email: 'E-mail', phone: 'Telefone', location: 'Localização', targetRoles: 'Cargos-alvo', seniority: 'Senioridade', workModes: 'Modalidades', minimumSalary: 'Pretensão mínima', availability: 'Disponibilidade' };
function rotuloFato(chave) { return FATOS[chave] ?? String(chave ?? 'a informação'); }
