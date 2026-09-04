import { mkdtemp, writeFile } from 'node:fs/promises';
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
