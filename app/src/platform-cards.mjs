// Como cada plataforma desenha um cartão de vaga na página pública de busca.
// Nenhuma delas publica JSON-LD na lista (sondagem de 05/09/2026), então a
// leitura vem do próprio HTML: o link da vaga, o cartão que o envolve e os
// elementos de título, empresa e local dentro dele. Expressões são strings
// porque o catálogo viaja para dentro da página (page.evaluate).

export const CARTOES_DE_VAGA = {
  GUPY: { host: '(^|\\.)gupy\\.io$', link: '\\.gupy\\.io/job/', card: 'li', title: 'h3', company: 'p', location: 'span' },
  // Mapeado em conta real (07/09/2026): cartão `.js_rowCard`, título `h2.js_vacancyTitle`,
  // empresa é o link para `/empresa-…aspx` (confidencial vem sem link), local em `.mb-8`
  // com a distância "a 648 Km de você" anexada, e uma linha de detalhes com salário,
  // experiência, escolaridade e modalidade (Home office/Híbrido/Presencial).
  INFOJOBS: { host: '(^|\\.)infojobs\\.com\\.br$', link: 'infojobs\\.com\\.br/vaga-de-.*__\\d+\\.aspx', card: '.js_rowCard, .card, li', title: 'h2', company: 'a[href*="/empresa-"], .js_btHiddenCompanyModal', location: '.mb-8', extra: '.d-inline-flex.text-medium', date: '.text-nowrap.small, .caption' },
  LINKEDIN: { host: '(^|\\.)linkedin\\.com$', link: 'linkedin\\.com/jobs/view/', card: 'li, .job-card-container, .base-card', title: '.base-search-card__title, .job-card-list__title, .artdeco-entity-lockup__title, h3', company: '.base-search-card__subtitle, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle, h4', location: '.job-search-card__location, .job-card-container__metadata-item, .artdeco-entity-lockup__caption' },
  VAGASCOM: { host: '(^|\\.)vagas\\.com\\.br$', link: 'vagas\\.com\\.br/vagas/v\\d+', card: 'li.vaga, li', title: 'a.link-detalhes-vaga, h2', company: '.emprVaga', location: '.vaga-local' },
  CATHO: { host: '(^|\\.)catho\\.com\\.br$', link: 'catho\\.com\\.br/vagas/.+/\\d+', card: 'li, article', title: 'h2, h3', company: '[class*="company" i], [class*="empresa" i]', location: '[class*="location" i], [class*="local" i]' },
  SOLIDES: { host: '(^|\\.)solides\\.com\\.br$', link: 'solides\\.com\\.br/vaga/', card: 'li, article, [class*="card" i]', title: 'h3, h2', company: '[class*="company" i], [class*="empresa" i]', location: '[class*="location" i], [class*="local" i]' }
};

export const EMPRESA_DESCONHECIDA = 'Empresa não informada';

// Roda dentro da página. Devolve as vagas dos cartões da plataforma cuja
// hospedagem corresponde à página atual; vazio quando a página não é de busca.
export function lerCartoesDeVaga(catalogo, empresaDesconhecida) {
  const host = location.hostname;
  // Páginas de teste declaram a plataforma em <html data-fluxo-plataforma="INFOJOBS">.
  const declarado = String(document.documentElement.dataset.fluxoPlataforma ?? '').toUpperCase();
  const entrada = (declarado && catalogo[declarado]) || Object.values(catalogo).find((item) => new RegExp(item.host, 'i').test(host));
  if (!entrada) return [];
  const link = new RegExp(entrada.link, 'i');
  const texto = (elemento) => (elemento?.innerText ?? '').replace(/\s+/g, ' ').trim();
  // Título: só a primeira linha. O LinkedIn repete o título num trecho oculto para
  // leitores de tela, e o innerText traria "Cargo X Cargo X".
  const primeiraLinha = (elemento) => String(elemento?.innerText ?? '').split('\n').map((linha) => linha.trim()).find(Boolean) ?? '';
  const vistos = new Set();
  const vagas = [];
  for (const ancora of document.querySelectorAll('a[href]')) {
    if (!link.test(ancora.href) || vistos.has(ancora.href)) continue;
    const cartao = ancora.closest(entrada.card) ?? ancora;
    const linhas = String(ancora.innerText ?? '').split('\n').map((linha) => linha.trim()).filter(Boolean);
    const titulo = primeiraLinha(cartao.querySelector(entrada.title)) || ancora.getAttribute('title') || linhas[linhas.length > 1 ? 1 : 0] || '';
    if (!titulo) continue;
    vistos.add(ancora.href);
    const empresa = texto(cartao.querySelector(entrada.company)) || (linhas.length > 1 && linhas[0] !== titulo ? linhas[0] : '') || empresaDesconhecida;
    // Distância até a pessoa ("São Paulo - SP, a 648,9 Km de você.") não é parte do local.
    const local = texto(cartao.querySelector(entrada.location)).replace(/,?\s*a\s[\d.,]+\s*km de voc[êe]\.?/i, '').trim();
    // Linha de detalhes do cartão: modalidade, salário, experiência e escolaridade,
    // quando a plataforma as mostra já na lista (a InfoJobs mostra).
    const detalhes = entrada.extra ? texto(cartao.querySelector(entrada.extra)) : '';
    const workMode = /home ?office|remot/i.test(detalhes) ? 'Remoto' : /h[ií]brid/i.test(detalhes) ? 'Híbrido' : /presencial/i.test(detalhes) ? 'Presencial' : '';
    const salary = (detalhes.match(/R\$\s?[\d.]+(?:,\d{2})?(?:\s*(?:a|-|até)\s*R\$\s?[\d.]+(?:,\d{2})?)?/) ?? [''])[0];
    const postedAt = entrada.date ? texto(cartao.querySelector(entrada.date)) : '';
    // Sem `source`: a plataforma da vaga é a da página, não "card" (isso virava a
    // plataforma exibida e a contagem de metas).
    vagas.push({ title: titulo, company: empresa, url: ancora.href, id: ancora.href, location: local, requirements: [], deadline: '', observedFrom: 'card', ...(workMode ? { workMode } : {}), ...(salary ? { salary } : {}), ...(postedAt ? { postedAt } : {}), ...(detalhes ? { details: detalhes } : {}) });
  }
  return vagas;
}
