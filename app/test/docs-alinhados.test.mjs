import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// A linha do app e a linha principal compartilham contratos e checklists. Quando
// as duas cópias divergem em silêncio, alguém trabalha com a regra errada — foi o
// que aconteceu com PRD e SDD. Este teste falha em vez de deixar a divergência passar.

const APP = fileURLToPath(new URL('../../docs/', import.meta.url));
const PRINCIPAL = fileURLToPath(new URL('../../../../docs/', import.meta.url));

// Documentos que só existem na linha do app: ninguém precisa duplicá-los.
const SO_DO_APP = new Set([
  'ARQUITETURA-IMPLEMENTADA.md',
  'CHECKLIST-IA-CONDUTORA.md',
  'CHECKLIST-NAVEGADOR-EMBUTIDO.md',
  'CONSOLIDACAO.md',
  'CONTRATO-DE-EXECUCAO.md',
  'DESKTOP.md',
  'ENTREGA-DESKTOP.md',
  'UX-DIRECAO-TRAJETORIA.md',
  'UX-JORNADA-E-SITUACOES.md'
]);

test('documentos compartilhados são idênticos nas duas linhas', async (t) => {
  if (!(await existe(PRINCIPAL))) {
    t.skip('A linha principal não está montada ao lado desta árvore; nada a comparar.');
    return;
  }

  const doApp = (await readdir(APP)).filter((nome) => nome.endsWith('.md') && !SO_DO_APP.has(nome));
  const daPrincipal = new Set((await readdir(PRINCIPAL)).filter((nome) => nome.endsWith('.md')));

  const divergentes = [];
  const ausentes = [];
  for (const nome of doApp) {
    if (!daPrincipal.has(nome)) { ausentes.push(nome); continue; }
    const [aqui, la] = await Promise.all([
      readFile(join(APP, nome), 'utf8'),
      readFile(join(PRINCIPAL, nome), 'utf8')
    ]);
    if (normalizar(aqui) !== normalizar(la)) divergentes.push(nome);
  }

  assert.deepEqual(ausentes, [], `documento compartilhado sem par na linha principal: ${ausentes.join(', ')}`);
  assert.deepEqual(divergentes, [], `documento compartilhado divergente entre as linhas: ${divergentes.join(', ')}`);
  assert.ok(doApp.length >= 20, `esperava o conjunto compartilhado completo; encontrados ${doApp.length}`);
});

test('os contratos que o checklist exige existem na linha do app', async () => {
  const nomes = new Set(await readdir(APP));
  for (const contrato of ['LINHA-DE-PRODUTO.md', 'POLITICA-AUTONOMIA.md', 'LIMITES-CAMPANHA.md', 'MATRIZ-PLATAFORMAS.md', 'PILOTO-SUPERVISIONADO.md', 'CHECKLIST-VERSAO-FINAL.md', 'CHECKLIST-REPAGINACAO-UI-UX.md', 'PRD-APP-HARNESS.md', 'SDD-APP-HARNESS.md']) {
    assert.ok(nomes.has(contrato), `contrato ausente: ${contrato}`);
  }
});

function normalizar(conteudo) {
  return conteudo.replace(/\r\n/g, '\n').trimEnd();
}

async function existe(caminho) {
  try { await stat(caminho); return true; } catch { return false; }
}
