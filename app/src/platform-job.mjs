// Como cada plataforma desenha a página de uma vaga. Mapeado em conta real
// (InfoJobs, 07/09/2026): título, empresa (ou "confidencial"), local/salário/
// modalidade no cabeçalho, descrição num único parágrafo com "Requisitos
// Obrigatórios: - item - item", blocos "Exigências", "Valorizado" e "Habilidades"
// (etiquetas), botão "CANDIDATAR-ME" (`.js_btApplyVacancy`) e vagas similares com
// seus próprios "Candidatar-me" (`.js_btnApplySimilar`), que nunca são a vaga aberta.
// Expressões são strings porque o catálogo viaja para dentro da página.

export const CATALOGO_VAGA = {
  INFOJOBS: {
    host: '(^|\\.)infojobs\\.com\\.br$',
    title: '.js_vacancyHeaderTitle, main h2',
    company: '.js_btHiddenCompanyModal, a[href*="/empresa-"]',
    header: '.js_vacancyHeaderTitle',
    description: '.js_vacancyDataPanels p, .js_vacancyDataPanels',
    sectionLabel: '.h4',
    sectionItems: 'li, .tag span',
    apply: '.js_btApplyVacancy',
    ignore: '.js_btnApplySimilar, [class*="similar" i]',
    // Candidatura em um clique (07/09/2026, vaga 90000001): após "CANDIDATAR-ME" aparece
    // o título "Você se candidatou à vaga <cargo>" e um convite ao plano Premium
    // ("Agora não" fecha). Sem formulário nem perguntas nesta vaga; perguntas
    // eliminatórias, quando existem, aparecem inline (`.js_visibleWhileKillers`).
    confirmation: 'h3, h2, .modal, [class*="alert" i]',
    confirmationText: 'voc[êe] se candidatou|candidatura (enviada|realizada|efetuada|conclu[íi]da)',
    previousText: 'voc[êe] j[áa] se candidatou|j[áa] (est[áa] )?candidatad[oa]',
    dismiss: 'a:has-text("Agora não"), button:has-text("Agora não"), .modal.show [data-dismiss="modal"], .modal.show .close'
  },
  GUPY: {
    host: '(^|\\.)gupy\\.io$',
    title: 'h1', company: '[data-testid*="company" i], header a[href*="gupy.io"]', header: 'h1',
    description: '[data-testid="job-description"], main', sectionLabel: 'h2, h3, strong', sectionItems: 'li',
    apply: 'a[href*="/candidate"], button[data-testid*="apply" i], a[data-testid*="apply" i]', ignore: ''
  },
  LINKEDIN: {
    host: '(^|\\.)linkedin\\.com$',
    title: '.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1', company: '.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link', header: 'h1',
    description: '#job-details, .jobs-description__content, .description__text', sectionLabel: 'h2, h3, strong', sectionItems: 'li',
    apply: '.jobs-apply-button, button[aria-label*="Candidatura" i], button[aria-label*="Apply" i]', ignore: '.jobs-similar-jobs, .similar-jobs'
  }
};

// Roda dentro da página. Devolve null quando a página não é de uma plataforma catalogada.
export function lerPaginaDeVaga(catalogo) {
  const declarado = String(document.documentElement.dataset.fluxoPlataforma ?? '').toUpperCase();
  const entrada = (declarado && catalogo[declarado]) || Object.values(catalogo).find((item) => new RegExp(item.host, 'i').test(window.location.hostname));
  if (!entrada) return null;
  const limpo = (t) => String(t ?? '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  const fora = (el) => entrada.ignore && el.closest(entrada.ignore);
  const primeiro = (seletor) => [...document.querySelectorAll(seletor)].find((el) => !fora(el)) ?? null;

  const title = limpo(primeiro(entrada.title)?.innerText);
  const empresaEl = primeiro(entrada.company);
  const company = limpo(empresaEl?.innerText).replace(/\s*\n.*$/s, '') || '';
  // Cabeçalho: as linhas curtas ao redor do título são local, salário e modalidade.
  const cabecalho = primeiro(entrada.header)?.closest('div')?.parentElement ?? primeiro(entrada.header)?.parentElement;
  const linhas = limpo(cabecalho?.innerText).split('\n').map((l) => l.trim()).filter((l) => l && l !== title && l !== company && l.length <= 80);
  const salary = linhas.find((l) => /R\$|sal[áa]rio|a combinar/i.test(l)) ?? '';
  const modalidade = linhas.find((l) => /home ?office|remot|h[ií]brid|presencial/i.test(l)) ?? '';
  const workMode = /home ?office|remot/i.test(modalidade) ? 'Remoto' : /h[ií]brid/i.test(modalidade) ? 'Híbrido' : /presencial/i.test(modalidade) ? 'Presencial' : '';
  const local = linhas.find((l) => l !== salary && l !== modalidade && !/^\d|avalia|confidencial|empresa$|^\d+ (set|out|nov|dez|jan|fev|mar|abr|mai|jun|jul|ago)/i.test(l) && !/^(nova|premium)$/i.test(l)) ?? '';

  const descEl = primeiro(entrada.description);
  const description = limpo(descEl?.innerText).slice(0, 8000);

  // Blocos rotulados (Exigências, Valorizado, Habilidades, Requisitos…): rótulo curto
  // seguido de lista ou etiquetas.
  const blocos = {};
  for (const rotuloEl of document.querySelectorAll(entrada.sectionLabel)) {
    if (fora(rotuloEl)) continue;
    const rotulo = limpo(rotuloEl.innerText);
    if (!rotulo || rotulo.length > 40 || rotuloEl.children.length > 2) continue;
    const proximo = rotuloEl.nextElementSibling;
    if (!proximo) continue;
    const itens = [...proximo.querySelectorAll(entrada.sectionItems)].map((el) => limpo(el.innerText)).filter((t) => t && t.length <= 200);
    if (itens.length) blocos[rotulo] = [...new Set(itens)];
  }

  // Descrição em parágrafo único: "Requisitos Obrigatórios: - a - b Diferenciais: - c".
  const secoes = {};
  const marcador = /(Requisitos(?:\s+(?:Obrigat[óo]rios|Desej[áa]veis|T[ée]cnicos))?|Diferenciais(?:\s*\([^)]*\))?|Benef[íi]cios|Descri[çc][ãa]o da vaga|Responsabilidades|Atividades|Qualifica[çc][õo]es|O que esperamos|O que buscamos|Pr[ée]-requisitos)\s*:/gi;
  const partes = description.split(marcador);
  for (let i = 1; i < partes.length; i += 2) {
    const nome = partes[i].trim();
    const itens = partes[i + 1].split(/\s[-–•●]\.?\s+|\n[-–•●]\.?\s*/).map((t) => t.replace(/^[-–•●.\s]+/, '').trim()).filter((t) => t.length >= 2 && t.length <= 200); // "GCP", "AWS", "SQL" têm 3 letras
    if (itens.length) secoes[nome] = itens;
  }
  const pegar = (obj, re) => Object.entries(obj).filter(([k]) => re.test(k)).flatMap(([, v]) => v);
  const requirements = [...new Set([...pegar(blocos, /habilidades|requisitos|conhecimentos/i), ...pegar(secoes, /^requisitos|qualifica|pr[ée]-requisitos|o que (esperamos|buscamos)/i)])].slice(0, 40);
  const eliminators = [...new Set(pegar(blocos, /exig[êe]ncias|obrigat/i))].slice(0, 20);
  const niceToHave = [...new Set([...pegar(blocos, /valorizado|diferenciais/i), ...pegar(secoes, /diferenciais/i)])].slice(0, 20);
  const contrato = [...document.querySelectorAll('p')].map((p) => limpo(p.innerText)).find((t) => /tipo de contrato|jornada|regime/i.test(t)) ?? '';

  const applyEl = primeiro(entrada.apply);
  return {
    url: window.location.href, title, company, location: local, salary, workMode, description, requirements, eliminators, niceToHave,
    contract: contrato, sections: Object.keys({ ...blocos, ...secoes }),
    applyLabel: limpo(applyEl?.innerText), applyAvailable: Boolean(applyEl)
  };
}
