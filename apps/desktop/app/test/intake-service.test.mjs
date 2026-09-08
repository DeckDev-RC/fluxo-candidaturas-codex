import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryService } from '../src/memory-service.mjs';
import { createIntakeService } from '../src/intake-service.mjs';

test('intake previews extracted profile facts, reports only blocking gaps, and commits after confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-intake-'));
  const memory = createMemoryService({ rootDir: root });
  const intake = createIntakeService({ rootDir: root, memoryService: memory });
  const preview = await intake.preview({
    source: 'curriculo/renato.txt',
    text: 'Nome: Pessoa Exemplo\nE-mail: pessoa@example.test\nCargo-alvo: Desenvolvedor backend\nSenioridade: Pleno\nCompetências: Node.js, SQL, Playwright\nIdiomas: Português e Inglês\nLocalização: Remoto'
  });

  assert.equal(preview.facts.name.value, 'Pessoa Exemplo');
  assert.deepEqual(preview.facts.skills.value, ['Node.js', 'SQL', 'Playwright']);
  assert.equal(preview.facts.targetRoles.value, 'Desenvolvedor backend');
  assert.ok(preview.missing.includes('phone'));
  assert.ok(preview.questions.length <= 5);

  const committed = await intake.commit({ preview, corrections: { phone: '(11) 90000-0000', workModes: 'Remoto' } });
  assert.equal(committed.ready, true);
  const summary = await memory.safeSummary();
  assert.equal(summary.facts.phone.value, '(11) 90000-0000');
  assert.equal(summary.facts.workModes.value, 'Remoto');
});

test('intake accepts several local documents and keeps imported material as resume variants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-intake-documents-'));
  const memory = createMemoryService({ rootDir: root });
  const intake = createIntakeService({ rootDir: root, memoryService: memory });
  const result = await intake.commit({
    preview: await intake.preview({ documents: [{ path: 'curriculo/backend.txt', text: 'Nome: Pessoa Teste\nCargo-alvo: Backend' }, { path: 'curriculo/dados.txt', text: 'Nome: Pessoa Teste\nCargo-alvo: Dados' }] }),
    corrections: { email: 'ana@example.com', phone: '000', location: 'São Paulo' }
  });

  assert.equal(result.resumeVariants, 2);
  assert.equal((await memory.get()).resumes.length, 2);
});
