// Como a IA aponta para um elemento e o que acontece quando o alvo não coopera.
// Refs (`aria-ref=eN`) valem enquanto o elemento existe; sites em React trocam
// nós o tempo todo, então uma ref pode sumir entre o snapshot e o clique. Aqui a
// ref é recuperada pelo papel e nome que ela tinha no último snapshot, papel+nome
// prefere correspondência exata e visível, ambiguidade devolve as opções, e um
// erro do Playwright vira uma frase que diz o que fazer em seguida.

const mapaPorPagina = new WeakMap();
// Refs do Playwright: "e12" ou, depois de navegações no mesmo frame, "f3e12".
export const REF_PLAYWRIGHT = /^(?:f\d+)?e\d+$/i;
const LINHA_REF = /^\s*-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?.*\[ref=((?:f\d+)?e\d+)\]/i;

// Guarda, por página, ref → { role, name } dos snapshots recentes (para recuperar
// refs perdidas). Acumula: a IA pode usar uma ref de dois snapshots atrás, e a
// ação anterior já gerou um snapshot novo. Refs são estáveis por elemento, então
// a descrição antiga continua verdadeira. Limite evita crescer sem fim.
const LIMITE_REFS = 3_000;
export function lembrarSnapshot(page, yaml) {
  const mapa = mapaPorPagina.get(page) ?? new Map();
  for (const linha of String(yaml).split('\n')) {
    const m = linha.match(LINHA_REF);
    if (m) { mapa.delete(m[3]); mapa.set(m[3], { role: m[1], name: (m[2] ?? '').replace(/\\"/g, '"') }); }
  }
  while (mapa.size > LIMITE_REFS) mapa.delete(mapa.keys().next().value);
  mapaPorPagina.set(page, mapa);
}

// Devolve { locator, resolvido: { role, name, recovered } }.
export async function resolverAlvo(page, { ref, role, name }) {
  const id = String(ref ?? '').trim();
  if (id) {
    // Achado real (LinkedIn, 19:30): após a primeira navegação as refs viram "f4e5" e
    // um padrão que só aceitava "e5" mandava tudo para o caminho errado → "a página mudou".
    const porRef = page.locator(REF_PLAYWRIGHT.test(id) ? `aria-ref=${id}` : `[data-fluxo-ref=${JSON.stringify(id)}]`);
    if (await porRef.count().catch(() => 0) === 1) return { locator: porRef, resolvido: { ref: id, ...(mapaPorPagina.get(page)?.get(id) ?? {}) } };
    // A ref sumiu (o site recriou o elemento): tenta pelo que ela era no último snapshot.
    const lembrado = mapaPorPagina.get(page)?.get(id);
    if (lembrado?.role && lembrado?.name) {
      const recuperado = await porPapelENome(page, lembrado.role, lembrado.name).catch(() => null);
      if (recuperado) return { locator: recuperado, resolvido: { ref: id, ...lembrado, recovered: true } };
    }
    throw erro('browser_reference_ambiguous', `A referência ${id} não está mais na página (o site a recriou). Observe de novo ou aponte por role e name${lembrado?.name ? ` (era ${lembrado.role} "${lembrado.name}")` : ''}.`);
  }
  if (role && name) return { locator: await porPapelENome(page, String(role), String(name)), resolvido: { role: String(role), name: String(name) } };
  throw erro('browser_reference_required', 'Informe ref (do último snapshot) ou role e name do elemento.');
}

// Exato e visível primeiro; depois parcial e visível. Vários candidatos → lista para a IA escolher.
async function porPapelENome(page, role, name) {
  const exato = page.getByRole(role, { name, exact: true }).filter({ visible: true });
  if (await exato.count().catch(() => 0) === 1) return exato;
  const parcial = page.getByRole(role, { name, exact: false }).filter({ visible: true });
  const total = await parcial.count().catch(() => 0);
  if (total === 1) return parcial;
  if (total === 0) throw erro('browser_reference_ambiguous', `Nenhum "${role}" visível com nome "${name}" na página. Observe de novo (use query="${name}").`);
  const nomes = await parcial.evaluateAll((els) => els.slice(0, 6).map((el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70))).catch(() => []);
  throw erro('browser_reference_ambiguous', `${total} elementos "${role}" casam com "${name}": ${nomes.map((n) => `"${n}"`).join(', ')}. Repita com o nome exato de um deles ou use a ref do snapshot.`);
}

// Erro do Playwright ao agir → código estável e a próxima coisa a tentar.
export function traduzirFalhaDeAcao(error, alvo = {}) {
  const texto = String(error?.message ?? '');
  const quem = alvo.name ? `"${alvo.name}"` : 'o elemento';
  if (/intercepts pointer events/i.test(texto)) {
    const outro = texto.match(/<([a-z]+)[^>]*>([^<]{0,60})/i);
    return erro('element_not_actionable', `${quem} está coberto por outro elemento${outro ? ` (${outro[1]}${outro[2] ? `: ${outro[2].trim()}` : ''})` : ''}. Feche o painel por cima (Escape ou o botão de fechar) ou role até ${quem} e tente de novo.`);
  }
  if (/not visible|element is hidden|outside of the viewport/i.test(texto)) return erro('element_not_actionable', `${quem} não está visível. Use scroll até ele (ref ou role+name) ou wait pelo texto próximo, depois tente de novo.`);
  if (/not enabled|disabled/i.test(texto)) return erro('element_not_actionable', `${quem} está desabilitado. Preencha o que falta antes (ex.: o texto da mensagem) e observe de novo.`);
  if (/not editable|readonly/i.test(texto)) return erro('element_not_actionable', `${quem} não aceita texto. Clique nele antes ou procure o campo de edição (role textbox) no snapshot.`);
  if (/detached|not attached/i.test(texto)) return erro('browser_reference_ambiguous', `${quem} foi removido da página no meio da ação. Observe de novo e repita.`);
  if (/Timeout/i.test(texto)) return erro('element_not_actionable', `${quem} não respondeu em 10s (não ficou visível, habilitado ou estável). Observe de novo; se estiver carregando, use wait.`);
  return erro(error?.code ?? 'browser_action_failed', texto.split('\n')[0].slice(0, 200) || 'A ação falhou.');
}

function erro(code, message) { return Object.assign(new Error(message), { code }); }
