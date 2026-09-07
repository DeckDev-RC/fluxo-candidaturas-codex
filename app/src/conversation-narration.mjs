// Cada chamada de ferramenta do agente vira uma frase curta para a pessoa ler,
// sem segredo, sem HTML e sem vocabulário de implementação. Quando a ferramenta
// devolve algo que exige a pessoa (login, desafio, revisão), a narração também
// produz o evento de espera.

const NOMES = { GUPY: 'Gupy', INFOJOBS: 'InfoJobs', PANDAPE: 'PandaPé', LINKEDIN: 'LinkedIn', CATHO: 'Catho', VAGASCOM: 'Vagas.com', SOLIDES: 'Sólides' };
const plataforma = (valor) => NOMES[String(valor ?? '').toUpperCase()] ?? String(valor ?? 'a plataforma');
// "linkedin.com/mynetwork" em vez da URL com parâmetros.
function enderecoCurto(url) {
  try { const u = new URL(String(url)); return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.slice(0, 80); } catch { return 'a página'; }
}

export function resumirFerramenta({ tool, arguments: args = {}, ok, result, error }) {
  const inicio = INICIO[tool]?.(args) ?? 'Executando uma etapa.';
  if (ok === undefined) return { inicio, fim: '', espera: null };
  if (ok === false) return { inicio, fim: traduzirFalha(tool, args, error), espera: null };
  const fim = FIM[tool]?.(args, result ?? {}) ?? { texto: 'Etapa concluída.' };
  return { inicio, fim: fim.texto, espera: fim.espera ?? null };
}

// Falha de ferramenta vira o que a pessoa pode fazer, não o código interno. Uma
// mensagem que parece de programador (chaves, caminhos, inglês) não vaza.
const FALHAS = {
  platform_disabled: (a) => `${plataforma(a.platform)} não está habilitada na campanha. Dá para ligar em "Ajustar plataformas e metas".`,
  search_unavailable: (a) => `Não consegui montar a busca em ${plataforma(a.platform)}; me diga o cargo ou envie o link da busca.`,
  queue_item_not_found: () => 'Essa vaga não está mais na fila; vou reler a lista.',
  manual_intervention_required: (a) => `${plataforma(a.platform)} pediu algo que só você pode fazer (login, verificação ou consentimento).`,
  untrusted_page: () => 'A página aberta não é da plataforma esperada; por segurança, não continuo por ali.',
  unsupported_target_url: () => 'O endereço dessa vaga não é uma página da plataforma; vou seguir com outra.',
  browser_unavailable: () => 'O navegador embutido não respondeu; vou tentar de novo em instantes.',
  payload_too_large: () => 'O arquivo é maior do que consigo receber (limite de 12 MB).',
  resume_not_found: () => 'Não encontrei o currículo importado; envie-o de novo pela conversa.',
  approval_required: () => 'O envio depende da sua aprovação; ele aparece em Decisões.',
  conversation_busy: () => 'Ainda estou terminando a etapa anterior.',
  confirmation_required: () => 'essa ação tem efeito fora do app; preciso do seu sim antes de fazer.',
  password_field_forbidden: () => 'senha e código de verificação são seus; digite na aba e eu continuo.',
  browser_reference_ambiguous: () => 'a página mudou; vou olhar de novo antes de agir.',
  browser_wait_timeout: () => 'a página não mudou como eu esperava; vou olhar de novo.',
  element_not_actionable: () => 'o elemento não respondeu (escondido, desabilitado ou coberto); vou ajustar e tentar de novo.',
  type_not_applied: () => 'o texto não entrou no campo; vou clicar nele e digitar de novo.',
  invalid_key: () => 'essa tecla não é permitida aqui.',
  invalid_browser_url: () => 'esse endereço não é uma página pública; não navego até ele.',
  invalid_platform: () => 'essa plataforma não existe no Fluxo.',
  unsupported_model: () => 'esse modelo não está disponível na sua conta do ChatGPT.'
};
const PARECE_TECNICO = /[{}[\]<>]|\b(undefined|null|NaN|TypeError|ReferenceError|ENOENT|ECONN|EPIPE|timeout|stack|json|http\/?\d?|\w+Error)\b|[a-z]+_[a-z_]+|\\|\/[\w-]+\/[\w-]+/i;

function traduzirFalha(tool, args, error) {
  const codigo = String(error?.code ?? '');
  if (FALHAS[codigo]) return `Não deu certo: ${FALHAS[codigo](args)}`;
  const mensagem = String(error?.message ?? '').trim().replace(/\.+$/, '');
  if (mensagem && !PARECE_TECNICO.test(mensagem)) return `Não deu certo: ${mensagem}.`;
  return 'Não deu certo nesta etapa; vou tentar de outro jeito ou te aviso o que falta.';
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
  fluxo_discard: (a) => `Descartando ${a.query ? `as vagas de "${a.query}"` : 'as vagas indicadas'} da fila.`,
  fluxo_read_job: () => 'Lendo a página da vaga para medir a aderência.',
  fluxo_browser_observe: (a) => `Olhando a página de ${plataforma(a.platform)}${a.query ? ` (procurando "${a.query}")` : ''}.`,
  fluxo_browser_find: (a) => `Procurando "${String(a.text ?? '').slice(0, 40)}" na página de ${plataforma(a.platform)}.`,
  fluxo_browser_read: (a) => `Lendo o conteúdo da página de ${plataforma(a.platform)}.`,
  fluxo_browser_click: (a) => `Clicando em ${a.name ? `"${String(a.name).slice(0, 40)}"` : 'um elemento'} da página.`,
  fluxo_browser_type: (a) => `Digitando "${String(a.text ?? '').slice(0, 40)}" na página.`,
  fluxo_browser_select: (a) => `Escolhendo "${a.value ?? ''}" na página.`,
  fluxo_browser_press: (a) => `Pressionando ${a.key ?? 'uma tecla'} na página.`,
  fluxo_browser_scroll: () => 'Rolando a página.',
  fluxo_browser_hover: (a) => `Passando o mouse sobre ${a.name ? `"${a.name}"` : 'um elemento'}.`,
  fluxo_browser_wait: (a) => (a.text ? `Esperando "${String(a.text).slice(0, 40)}" aparecer.` : a.textGone ? `Esperando "${String(a.textGone).slice(0, 40)}" sumir.` : 'Aguardando a página.'),
  fluxo_browser_screenshot: () => 'Olhando a tela.',
  fluxo_browser_navigate: (a) => `Indo para ${enderecoCurto(a.url)} em ${plataforma(a.platform)}.`,
  fluxo_browser_back: () => 'Voltando uma página.',
  fluxo_campaign: (a) => (a.platforms || a.totalGoal !== undefined || a.maxApplicationsPerRun !== undefined ? 'Ajustando plataformas e metas da campanha.' : 'Lendo a campanha.'),
  fluxo_schedule: (a) => ({ set: 'Agendando a consulta automática de novidades.', cancel: 'Cancelando a consulta automática.' })[a.action] ?? 'Conferindo a consulta automática.',
  fluxo_codex_settings: (a) => (a.model || a.effort || a.verbosity ? 'Ajustando como o ChatGPT trabalha aqui.' : 'Lendo as configurações do ChatGPT.'),
  fluxo_export: (a) => (a.kind === 'shareable' ? 'Gerando a cópia compartilhável do Fluxo.' : 'Gerando o pacote de evidências.'),
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
    if (r.challenge) return { texto: `${nome} pediu uma verificação (${r.challenge === 'captcha' ? 'CAPTCHA' : 'código de verificação'}).`, espera: { kind: 'challenge', platform: String(a.platform).toUpperCase(), challenge: r.challenge } };
    if (r.loginPending) return { texto: `${nome} está aberto e pede login.`, espera: { kind: 'login', platform: String(a.platform).toUpperCase(), url: r.url } };
    if (r.consentPending) return { texto: `${nome} aberto, com um aviso de cookies/consentimento para você decidir.`, espera: { kind: 'consent', platform: String(a.platform).toUpperCase(), url: r.url } };
    return { texto: `${nome} aberto; você já está conectado.` };
  },
  fluxo_browser_status: (a, r) => ({ texto: `${(r.tabs ?? []).length} aba(s) aberta(s).` }),
  fluxo_discover: (a, r) => {
    const criadas = Array.isArray(r.created) ? r.created.length : Number(r.createdCount ?? r.count ?? 0);
    const falhas = Array.isArray(r.failures) ? r.failures : [];
    if (falhas.length && !criadas) return { texto: `Não consegui ler a busca em ${plataforma(a.platform)}: ${falhas[0].message ?? 'página não suportada'}.` };
    return { texto: `${criadas} vaga(s) nova(s) observada(s) em ${plataforma(a.platform)}.` };
  },
  fluxo_discard: (a, r) => ({ texto: `${Number(r.discarded ?? 0)} vaga(s) descartada(s); ${Number(r.remaining ?? 0)} continuam na fila.` }),
  fluxo_browser_observe: (a, r) => ({ texto: r.snapshot !== undefined ? `${r.title || enderecoCurto(r.url)}: página observada${r.filtered ? ' (filtrada)' : ''}${r.truncated ? ', cortada' : ''}.` : `${r.title || enderecoCurto(r.url)}: ${Number(r.totalElements ?? 0)} elemento(s) interativo(s).` }),
  fluxo_browser_find: (a, r) => ({ texto: /nada no snapshot/.test(String(r.snapshot ?? '')) ? `"${String(a.text ?? '').slice(0, 40)}" não está na página.` : `Encontrei "${String(a.text ?? '').slice(0, 40)}" na página.` }),
  fluxo_browser_hover: () => ({ texto: 'Mouse posicionado.' }),
  fluxo_browser_wait: (a, r) => ({ texto: `Pronto; agora em ${r.title || enderecoCurto(r.url)}.` }),
  fluxo_browser_screenshot: (a, r) => ({ texto: `Vi a tela de ${r.title || enderecoCurto(r.url)}.` }),
  fluxo_browser_read: (a, r) => ({ texto: `Li ${Number(r.text?.length ?? 0)} caracteres de ${r.title || enderecoCurto(r.url)}.` }),
  fluxo_browser_click: (a, r) => ({ texto: `Cliquei; agora em ${r.title || enderecoCurto(r.url)}.` }),
  fluxo_browser_type: (a, r) => ({ texto: a.submit ? `Busquei; agora em ${r.title || enderecoCurto(r.url)}.` : 'Texto digitado.' }),
  fluxo_browser_select: () => ({ texto: 'Opção escolhida.' }),
  fluxo_browser_press: () => ({ texto: 'Tecla enviada.' }),
  fluxo_browser_scroll: (a, r) => ({ texto: `Página rolada (${Number(r.scroll?.y ?? 0)} px).` }),
  fluxo_browser_navigate: (a, r) => ({ texto: `Aberto: ${r.title || enderecoCurto(r.url)}.` }),
  fluxo_browser_back: (a, r) => ({ texto: `De volta a ${r.title || enderecoCurto(r.url)}.` }),
  fluxo_campaign: (a, r) => ({ texto: r.updated ? `Campanha ajustada: ${r.enabledCount} plataforma(s) habilitada(s), meta total ${r.totalGoal}.` : `Campanha lida: ${r.enabledCount} plataforma(s) habilitada(s), meta total ${r.totalGoal}.` }),
  fluxo_schedule: (a, r) => ({ texto: r.scheduled ? `Consulta automática a cada ${r.intervalMinutes} min.` : 'Sem consulta automática agendada.' }),
  fluxo_codex_settings: (a, r) => ({ texto: r.updated ? `ChatGPT ajustado: modelo ${r.settings?.model || 'padrão'}, esforço ${r.settings?.effort}.` : `ChatGPT: modelo ${r.settings?.model || 'padrão'}, esforço ${r.settings?.effort}.` }),
  fluxo_export: (a, r) => ({ texto: `Arquivo gerado em ${r.path ?? r.output ?? 'pasta local'}.` }),
  fluxo_read_job: (a, r) => ({ texto: r.requirements?.length ? `${r.role ?? 'Vaga'} em ${r.company ?? 'empresa'}: ${r.requirements.length} requisito(s) lidos, aderência ${r.fit?.classification ?? ''} ${r.fit?.score ?? ''}%.` : `${r.role ?? 'Vaga'}: a página não lista requisitos de forma reconhecível.` }),
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
