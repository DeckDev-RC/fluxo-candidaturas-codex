import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('fixture E2E audits onboarding, queue, run, approval, checkpoint and operations', async () => {
  const root = await fixture();
  const server = createServer({ rootDir: root, requireSession: true,
    applicationFlow: {
      async prepareNext() { return { run: { id: 'run-e2e' }, item: { id: 'q-e2e' }, snapshot: { text: 'fixture' } }; },
      requestSubmissionApproval() { return { id: 'approval-e2e', status: 'pending' }; },
      async submitApproved() { return { application: { id: 'app-e2e', status: 'enviada' } }; }
    },
    agentAdapter: { startThread: async () => ({ thread: { id: 'thread-e2e' } }), runTurn: async () => ({ turn: { id: 'turn-e2e' } }) }
  });
  const address = await listen(server);
  try {
    const sessionResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`);
    const session = await sessionResponse.json(); const cookie = sessionResponse.headers.get('set-cookie')?.split(';')[0];
    const headers = { cookie, 'x-fluxo-csrf': session.csrfToken, 'content-type': 'application/json' };
    const onboarding = await fetch(`http://127.0.0.1:${address.port}/api/v1/onboarding`, { method: 'POST', headers, body: JSON.stringify(onboardingInput()) });
    assert.equal(onboarding.status, 200);
    const added = await fetch(`http://127.0.0.1:${address.port}/api/v1/queue/items`, { method: 'POST', headers, body: JSON.stringify({ platform: 'GUPY', company: 'Acme', role: 'Backend', identifierOrUrl: 'e2e-1' }) });
    assert.equal(added.status, 201);
    assert.equal((await (await fetch(`http://127.0.0.1:${address.port}/api/v1/queue/search?query=backend`, { headers: { cookie } })).json()).length, 1);
    const checkpoint = await fetch(`http://127.0.0.1:${address.port}/api/v1/state/checkpoint`, { method: 'POST', headers, body: JSON.stringify({ phase: 'e2e' }) });
    assert.equal(checkpoint.status, 200);
    const run = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, { method: 'POST', headers, body: JSON.stringify({ kind: 'e2e' }) });
    assert.equal(run.status, 201);
    const runBody = await run.json(); const runId = runBody.id;
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${runId}/agent-thread`, { method: 'POST', headers, body: JSON.stringify({}) })).status, 201);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${runId}/agent-turn`, { method: 'POST', headers, body: JSON.stringify({ threadId: 'thread-e2e', text: 'fixture' }) })).status, 200);
    const persistedRun = await (await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${runId}`, { headers: { cookie } })).json();
    assert.equal(persistedRun.agentThreadId, 'thread-e2e'); assert.equal(persistedRun.currentTurnId, 'turn-e2e');
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/applications/prepare`, { method: 'POST', headers, body: '{}' })).status, 201);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/applications/run-e2e/approval`, { method: 'POST', headers, body: JSON.stringify({ fields: { role: 'Backend' } }) })).status, 201);
    const submitted = await fetch(`http://127.0.0.1:${address.port}/api/v1/applications/run-e2e/submit`, { method: 'POST', headers, body: JSON.stringify({ approvalId: 'approval-e2e', fields: { role: 'Backend' } }) });
    assert.equal(submitted.status, 200);
    const operations = await fetch(`http://127.0.0.1:${address.port}/api/v1/operations`, { headers: { cookie } });
    assert.equal(operations.status, 200);
    assert.ok((await operations.json()).length >= 3);
  } finally { await close(server); }
});

function onboardingInput() { return { name: 'Pessoa Teste', email: 'pessoa@example.test', phone: '11900000000', location: 'Goiânia', targetRoles: 'Backend', seniority: 'Pleno', technicalFocus: 'Node', workModes: 'remoto', acceptedLocations: 'Brasil', contracts: 'CLT', minimumSalary: '5000', availability: 'imediata', education: 'Tecnologia', languages: 'Português', professionalSummary: 'Dev', strengths: 'APIs', workAuthorization: 'Brasil', travel: 'não', pcd: 'não', campaign: { totalGoal: 1, dailyGoal: 1, weeklyGoal: 1, platforms: [{ name: 'GUPY', enabled: true, goal: 1 }] } }; }
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'fluxo-e2e-')); for (const directory of ['estado', 'campanha', 'fila', 'candidaturas', 'config']) await mkdir(join(root, directory), { recursive: true }); await writeFile(join(root, 'config', 'plataformas.json'), JSON.stringify({ platforms: [{ name: 'GUPY' }] })); await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify({ platforms: [] })); await writeFile(join(root, 'fila', 'vagas.json'), '[]'); await writeFile(join(root, 'candidaturas', 'candidaturas.json'), '[]'); return root; }
function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
