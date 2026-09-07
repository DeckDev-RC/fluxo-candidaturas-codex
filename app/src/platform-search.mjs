import { PLATFORM_NAMES } from './platform-adapters.mjs';

const SEARCH_PATHS = {
  GUPY: (q) => `https://portal.gupy.io/job-search/term=${encodeURIComponent(q)}`,
  // Mapeado em conta real (07/09/2026): a busca "home office" tem URL própria e devolve
  // só vagas remotas; a busca comum aceita `palabra`.
  INFOJOBS: (q, { remoto = false } = {}) => (remoto ? `https://www.infojobs.com.br/vagas-de-emprego-${slug(q)}-trabalho-home-office.aspx` : `https://www.infojobs.com.br/vagas.aspx?palabra=${encodeURIComponent(q)}`),
  PANDAPE: () => '',
  LINKEDIN: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Brasil`,
  CATHO: (q) => `https://www.catho.com.br/vagas/${encodeURIComponent(q)}/`,
  VAGASCOM: (q) => `https://www.vagas.com.br/vagas-de-${encodeURIComponent(q)}`,
  SOLIDES: (q) => `https://vagas.solides.com.br/?q=${encodeURIComponent(q)}`
};

// Página de entrada de cada plataforma: é o que a IA abre para a pessoa entrar.
const HOME_PATHS = {
  GUPY: 'https://portal.gupy.io/',
  INFOJOBS: 'https://www.infojobs.com.br/',
  PANDAPE: 'https://www.pandape.com.br/',
  LINKEDIN: 'https://www.linkedin.com/jobs/',
  CATHO: 'https://www.catho.com.br/',
  VAGASCOM: 'https://www.vagas.com.br/',
  SOLIDES: 'https://vagas.solides.com.br/'
};

const HOSTS = [
  ['GUPY', /(^|\.)gupy\.io$/i], ['INFOJOBS', /(^|\.)infojobs\.com\.br$/i], ['PANDAPE', /(^|\.)pandape\.com(\.br)?$/i],
  ['LINKEDIN', /(^|\.)linkedin\.com$/i], ['CATHO', /(^|\.)catho\.com\.br$/i], ['VAGASCOM', /(^|\.)vagas\.com\.br$/i], ['SOLIDES', /(^|\.)solides\.com\.br$/i]
];

export function platformHome(platform, baseUrls = {}) {
  const name = String(platform ?? '').toUpperCase();
  const configurada = String(baseUrls[name] ?? '').replace('{q}', '');
  if (configurada) { try { return new URL(configurada).origin + '/'; } catch { /* usa o catálogo */ } }
  return HOME_PATHS[name] ?? '';
}

// O termo pesquisado, lido de volta da URL de busca (para rotular as vagas por busca).
export function queryFromSearchUrl(url) {
  try {
    const parsed = new URL(String(url));
    for (const chave of ['term', 'palabra', 'keywords', 'q', 'query']) { const valor = parsed.searchParams.get(chave); if (valor) return valor.trim(); }
    const termo = parsed.pathname.match(/job-search\/term=([^/]+)|\/vagas\/([^/]+)\/?$|vagas-de-(?:emprego-)?([^/]+?)(?:-trabalho-home-office)?\.aspx|vagas-de-([^/]+)/);
    const bruto = termo?.[1] ?? termo?.[2] ?? termo?.[3] ?? termo?.[4] ?? '';
    return decodeURIComponent(bruto).replace(/[-+]/g, ' ').trim();
  } catch { return ''; }
}

// Plataforma a que uma URL pertence, pelo domínio; '' quando não é uma das conhecidas.
export function platformOfUrl(url) {
  let host = '';
  try { host = new URL(String(url)).hostname; } catch { return ''; }
  return HOSTS.find(([, padrao]) => padrao.test(host))?.[0] ?? '';
}

// `baseUrls` vem das chaves `<PLATAFORMA>_URL` do `.env` (ver config/plataformas.json).
// Um override com `{q}` recebe a consulta; sem o marcador, a URL é usada como a própria página de busca.
export function buildPlatformSearch({ filters = {}, platforms = PLATFORM_NAMES, baseUrls = {} } = {}) {
  const query = [filters.roles ?? filters.targetRoles, filters.location, filters.seniority].flat().filter(Boolean).join(' ').trim();
  // Só remoto quando a pessoa aceita apenas remoto: aí a busca já filtra na origem.
  const modos = [filters.workModes].flat().filter(Boolean).map((m) => String(m).toLocaleLowerCase());
  const remoto = modos.length > 0 && modos.every((m) => /remot|home ?office/.test(m));
  const selected = (platforms.length ? platforms : PLATFORM_NAMES).map(namesOf);
  return selected.map(({ platform, searchUrl: configured }) => {
    const override = configured || baseUrls[platform] || '';
    const term = query || 'vagas';
    if (override) return { platform, searchUrl: override.replace('{q}', encodeURIComponent(term)), query: term, source: 'configurada' };
    if (platform === 'PANDAPE') {
      return { platform, searchUrl: '', unavailable: true, reason: 'PandaPé não oferece busca pública; use convite.' };
    }
    const builder = SEARCH_PATHS[platform];
    return { platform, searchUrl: builder ? builder(term, { remoto }) : '', query: term, source: 'padrão' };
  });
}

// "Desenvolvedor Back-end" → "desenvolvedor-back-end" (URLs amigáveis da InfoJobs).
function slug(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vagas';
}

function namesOf(item) {
  if (item && typeof item === 'object') {
    return { platform: String(item.name ?? item.platform ?? '').toUpperCase(), searchUrl: String(item.searchUrl ?? '') };
  }
  return { platform: String(item).toUpperCase(), searchUrl: '' };
}

export function classifySearchPage({ jobs = [], emptyResults = false, available = true } = {}) {
  if (available === false) return { kind: 'unavailable', message: 'A plataforma está indisponível.' };
  if (emptyResults === true || (Array.isArray(jobs) && jobs.length === 0)) return { kind: 'empty', message: 'A busca não retornou vagas nesta página.' };
  return { kind: 'results', count: jobs.length };
}
