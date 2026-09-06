import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CARTOES_DE_VAGA, EMPRESA_DESCONHECIDA, lerCartoesDeVaga } from '../app/src/platform-cards.mjs';

// As páginas públicas de busca não publicam JSON-LD (sondagem de 05/09/2026):
// as vagas vêm dos cartões. Aqui a leitura roda num Chromium real sobre marcação
// no formato observado em cada plataforma, sem tocar as plataformas.
const PAGINA = `
<ul>
  <li><a href="https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal"><p>Cambuhy Agrícola</p><h3>Auxiliar de Viveiro | Matão - SP</h3><span>Matão - SP</span></a></li>
  <li><a href="https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal"><p>Cambuhy Agrícola</p><h3>Auxiliar de Viveiro | Matão - SP</h3></a></li>
  <li><a href="https://outra.gupy.io/job/def"><h3>Engenharia de Dados</h3></a></li>
  <li><a href="https://portal.gupy.io/">Início</a></li>
</ul>`;

test('os cartões viram vagas com título, empresa e local, sem duplicar o mesmo link', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(PAGINA);
    // Página local não tem hospedagem: o catálogo de teste casa com hospedagem vazia.
    const catalogo = { TESTE: { ...CARTOES_DE_VAGA.GUPY, host: '^$' } };
    const vagas = await page.evaluate(([fonte, cat, desconhecida]) => (new Function(`return (${fonte})`))()(cat, desconhecida), [lerCartoesDeVaga.toString(), catalogo, EMPRESA_DESCONHECIDA]);
    assert.equal(vagas.length, 2, 'link repetido e link fora do padrão não viram vaga');
    assert.deepEqual(vagas[0], { title: 'Auxiliar de Viveiro | Matão - SP', company: 'Cambuhy Agrícola', url: 'https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal', id: 'https://empresa.gupy.io/job/abc?jobBoardSource=gupy_portal', location: 'Matão - SP', requirements: [], deadline: '', source: 'card' });
    assert.equal(vagas[1].company, EMPRESA_DESCONHECIDA, 'sem empresa no cartão, a vaga entra com empresa não informada');
  } finally { await browser.close(); }
});

test('o catálogo de cartões é válido: expressões compilam e seletores são aceitos pelo navegador', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [plataforma, entrada] of Object.entries(CARTOES_DE_VAGA)) {
      assert.doesNotThrow(() => new RegExp(entrada.host), `${plataforma}: host`);
      assert.doesNotThrow(() => new RegExp(entrada.link), `${plataforma}: link`);
      const aceitos = await page.evaluate((seletores) => seletores.map((s) => { try { document.querySelector(s); return true; } catch { return false; } }), [entrada.card, entrada.title, entrada.company, entrada.location]);
      assert.deepEqual(aceitos, [true, true, true, true], `${plataforma}: seletores`);
    }
    // A URL de busca de cada plataforma pertence à hospedagem do próprio cartão.
    const { buildPlatformSearch } = await import('../app/src/platform-search.mjs');
    for (const busca of buildPlatformSearch({ filters: { roles: 'dados' }, platforms: Object.keys(CARTOES_DE_VAGA) })) {
      assert.match(new URL(busca.searchUrl).hostname, new RegExp(CARTOES_DE_VAGA[busca.platform].host, 'i'), busca.platform);
    }
  } finally { await browser.close(); }
});
