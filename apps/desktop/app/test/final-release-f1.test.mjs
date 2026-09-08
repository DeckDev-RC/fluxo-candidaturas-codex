import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createResumeImportService } from '../src/resume-import-service.mjs';
import { createMemoryService } from '../src/memory-service.mjs';
import { extractStructuredFacts } from '../src/fact-extractor.mjs';
import { applyCampaignFilters } from '../src/campaign-filters.mjs';
import { createIntakeService } from '../src/intake-service.mjs';

test('import copies an external file, verifies hash and does not announce success on empty content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-import-'));
  const memory = createMemoryService({ rootDir: root });
  const service = createResumeImportService({ rootDir: root, memoryService: memory });
  const text = 'Nome: Pessoa Exemplo\nE-mail: ana@example.com\nTelefone: 11900000000\nLocalização: Remoto\nCargo-alvo: Backend';
  const imported = await service.importFile({ filename: 'cv-externo.txt', contentBase64: Buffer.from(text).toString('base64') });
  assert.equal(imported.imported, true);
  assert.equal(imported.path, 'curriculo/cv-externo.txt');
  assert.equal(imported.sha256.length, 64);
  assert.equal(await readFile(join(root, imported.path), 'utf8'), text);
  await assert.rejects(service.importFile({ filename: 'vazio.txt', contentBase64: Buffer.from('x').toString('base64') }), { code: 'resume_corrupt_or_empty' });
});

test('fact extractor never auto-confirms inferences and records origin and date', () => {
  const extracted = extractStructuredFacts({ text: 'Contato pessoa@example.test para Backend', source: 'curriculo/cv.txt', now: () => new Date('2026-09-04T12:00:00.000Z') });
  assert.equal(extracted.facts.email.confirmed, false);
  assert.equal(extracted.facts.email.kind, 'inferred');
  assert.equal(extracted.facts.email.extractedAt, '2026-09-04T12:00:00.000Z');
});

test('answering a gap persists memory so a restart does not repeat the question', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-gap-'));
  const memory = createMemoryService({ rootDir: root, mutationLock: false });
  const intake = createIntakeService({ rootDir: root, memoryService: memory });
  const preview = await intake.preview({ text: 'Nome: Pessoa Teste' });
  assert.equal(preview.missing.includes('email'), true);
  await memory.recordAnswers({ email: 'ana@example.com', phone: '11', location: 'Remoto', targetRoles: 'Backend' });
  const restarted = createMemoryService({ rootDir: root });
  const summary = await restarted.safeSummary();
  assert.equal(summary.facts.email.value, 'ana@example.com');
  assert.equal(summary.facts.email.confirmed, true);
  assert.equal(summary.answers.email, 'ana@example.com');
});

test('eliminatory campaign filter blocks selection using only observed facts and description', () => {
  const result = applyCampaignFilters(
    { role: 'Estágio', location: 'Rio', workMode: 'Presencial', salary: '2000', description: 'requer disponibilidade imediata' },
    { roles: ['Backend'], locations: ['São Paulo', 'Remoto'], workModes: ['Remoto'], minimumSalary: 8000, exclusions: ['estágio'] },
    { skills: { value: ['Node.js'], confirmed: true } }
  );
  assert.equal(result.eligible, false);
  assert.match(result.explanation, /impediu/);
});
