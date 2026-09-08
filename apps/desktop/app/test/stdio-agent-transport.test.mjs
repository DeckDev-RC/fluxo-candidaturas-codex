import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStdioAgentTransport } from '../src/stdio-agent-transport.mjs';

test('stdio transport performs JSONL request-response with a local agent process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-agent-'));
  const fakeAgent = join(root, 'fake-agent.mjs');
  await writeFile(fakeAgent, `
    process.stdin.setEncoding('utf8');
    let buffer = '';
    process.stdin.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\\n');
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line);
        const result = message.method === 'initialize' ? { server: 'fake' } : { method: message.method };
        process.stdout.write(JSON.stringify({ id: message.id, result }) + '\\n');
      }
    });
  `);
  const transport = createStdioAgentTransport({ command: process.execPath, args: [fakeAgent] });

  try {
    const initialized = await transport.request('initialize', { clientInfo: { name: 'test' } });
    const turn = await transport.request('turn/start', { threadId: 'thr-1' });

    assert.deepEqual(initialized, { server: 'fake' });
    assert.deepEqual(turn, { method: 'turn/start' });
  } finally {
    await transport.close();
  }
});

test('stdio transport removes API keys and isolates the Codex home for ChatGPT OAuth', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-agent-auth-'));
  const fakeAgent = join(root, 'fake-agent-auth.mjs');
  await writeFile(fakeAgent, `process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { const message = JSON.parse(chunk); process.stdout.write(JSON.stringify({ id: message.id, result: { openai: process.env.OPENAI_API_KEY || '', codex: process.env.CODEX_API_KEY || '', home: process.env.CODEX_HOME || '', keep: process.env.FLUXO_TEST_VALUE || '' } }) + '\\n'); });`);
  const transport = createStdioAgentTransport({ command: process.execPath, args: [fakeAgent], cwd: root, authMode: 'chatgpt', env: { OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', CODEX_HOME: 'C:/CodexData', FLUXO_TEST_VALUE: 'kept' } });
  try { const result = await transport.request('initialize'); assert.deepEqual(result, { openai: '', codex: '', home: join(root, 'estado', 'codex-home'), keep: 'kept' }); await access(join(root, 'estado', 'codex-home')); } finally { await transport.close(); }
});
