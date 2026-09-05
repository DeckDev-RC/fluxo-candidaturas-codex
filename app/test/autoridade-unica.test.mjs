import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLocalRuntime } from '../src/runtime.mjs';
import { createMemoryService } from '../src/memory-service.mjs';
import { createStateDocument } from '../src/state-document.mjs';
import { initializeNewFluxoPersistence, createPersistenceAuthority } from '../src/persistence-authority.mjs';
import { readFluxoState } from '../src/state-reader.mjs';

// F7-01: uma autoridade por documento. Em raiz migrada, memória, exceções,
// descoberta, acompanhamento, agenda e notificações vivem no banco local;
// em raiz legada, seguem nos arquivos. Nunca nos dois ao mesmo tempo.

test('raiz com banco local não deixa documento de estado em arquivo paralelo', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-autoridade-'));
  const runtime = await createLocalRuntime({ rootDir: raiz, schedulerTickMs: 3_600_000 });
  try {
    assert.equal(await runtime.persistence.getMode(), 'sqlite');

    await runtime.memoryService.upsertFacts([{ key: 'name', value: 'Pessoa Única', confirmed: true }]);
    await runtime.exceptionService.create({ type: 'captcha', message: 'Verificação humana pedida', nextAction: 'Concluir no navegador' });
    await runtime.schedulerService.schedule({ id: 'followup', intervalMs: 60_000 });
    await runtime.notificationService.notify({ reference: 'app-1', type: 'entrevista', message: 'Convite recebido' });

    for (const servico of ['memoryService', 'exceptionService', 'schedulerService', 'notificationService', 'discoveryService', 'followUpMonitor']) {
      assert.equal(await runtime[servico].authority(), 'sqlite', `${servico} precisa usar o banco local como autoridade`);
    }

    const arquivos = await readdir(join(raiz, 'estado'));
    for (const proibido of ['memoria.json', 'excecoes.json', 'agenda.json', 'notificacoes.json']) {
      assert.equal(arquivos.includes(proibido), false, `${proibido} não pode existir como autoridade paralela`);
    }

    // O que a interface lê é o mesmo que está no banco.
    const estado = await readFluxoState(raiz, { persistence: runtime.persistence });
    assert.equal(estado.memory.facts.name.value, 'Pessoa Única');
    assert.equal(estado.exceptions.length, 1);
  } finally {
    await runtime.close();
  }
});

test('documentos de estado ficam registrados no banco com nome próprio', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-autoridade-'));
  const persistence = await initializeNewFluxoPersistence({ rootDir: raiz });
  try {
    const memoria = createMemoryService({ rootDir: raiz, persistence, mutationLock: false });
    await memoria.upsertFacts([{ key: 'email', value: 'pessoa@example.test', confirmed: true }]);
    const registrados = persistence.listRuntimeDocuments().map((item) => item.name);
    assert.deepEqual(registrados, ['memory']);
    assert.equal(persistence.readRuntimeDocument('memory').facts.email.value, 'pessoa@example.test');
  } finally { persistence.close(); }
});

test('raiz legada continua usando o arquivo, sem criar banco às escondidas', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-legado-'));
  await mkdir(join(raiz, 'campanha'), { recursive: true });
  await writeFile(join(raiz, 'campanha', 'config.json'), JSON.stringify({ platforms: [] }));
  const persistence = createPersistenceAuthority({ rootDir: raiz });
  try {
    assert.equal(await persistence.isSqliteAuthority(), false);
    const documento = createStateDocument({ rootDir: raiz, persistence, name: 'memory', file: 'estado/memoria.json', fallback: { facts: {} } });
    assert.equal(await documento.authority(), 'json');
    await documento.write({ facts: { name: { value: 'Legado', confirmed: true } } });
    assert.equal((await documento.read()).facts.name.value, 'Legado');
    assert.ok((await readdir(join(raiz, 'estado'))).includes('memoria.json'));
    // Sem migração explícita, o banco não recebe documento de estado.
    const database = new DatabaseSync(join(raiz, 'estado', 'fluxo.sqlite'), { readOnly: true });
    try {
      assert.equal(database.prepare('select count(*) as total from runtime_documents').get().total, 0);
    } finally { database.close(); }
  } finally { persistence.close(); }
});

test('a agenda sobrevive ao reinício lendo do banco, não da memória do processo', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-autoridade-'));
  // Acima do intervalo mínimo de acompanhamento: o serviço nunca aceita menos que ele.
  const intervalo = 45 * 60 * 1000;
  const primeiro = await createLocalRuntime({ rootDir: raiz, schedulerTickMs: 3_600_000 });
  try {
    await primeiro.schedulerService.schedule({ id: 'followup', intervalMs: intervalo });
    assert.equal((await primeiro.schedulerService.schedule({ id: 'curto', intervalMs: 1000 })).intervalMs, 30 * 60 * 1000, 'intervalo abaixo do mínimo é elevado ao mínimo');
  } finally { await primeiro.close(); }

  const segundo = await createLocalRuntime({ rootDir: raiz, schedulerTickMs: 3_600_000 });
  try {
    const trabalhos = await segundo.schedulerService.list();
    assert.equal(trabalhos.length, 2);
    assert.equal(trabalhos.find((item) => item.id === 'followup').intervalMs, intervalo);
    assert.equal(segundo.schedulerRunner.running, true, 'o executor da agenda religa junto do runtime');
  } finally { await segundo.close(); }
});
