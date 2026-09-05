import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('events API appends an event and streams it as SSE', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-events-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root });
  const address = await listen(server);

  try {
    const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' })
    });
    const run = await runResponse.json();
    const eventResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${run.id}/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'queue.item_claimed', payload: { id: 'q1' } })
    });
    assert.equal(eventResponse.status, 201);

    const stream = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${run.id}/events`);
    const body = await stream.text();
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type'), /^text\/event-stream/);
    assert.match(body, /queue\.item_claimed/);
  } finally {
    await close(server);
  }
});

test('events API redacts sensitive payloads before the response and SSE stream', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-event-redaction-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const server = createServer({ rootDir: root });
  const address = await listen(server);
  const payload = {
    password: 'api-password-secret', token: 'api-token-secret', cookie: 'api-cookie-secret',
    mfa: 'api-mfa-secret', authorization: 'api-authorization-secret', credential: 'api-credential-secret'
  };

  try {
    const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'campaign' })
    });
    const run = await runResponse.json();
    const eventResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${run.id}/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'agent.notification', payload })
    });
    const eventBody = await eventResponse.json();
    const stream = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${run.id}/events`);
    const body = await stream.text();
    for (const secret of Object.values(payload)) {
      assert.equal(JSON.stringify(eventBody).includes(secret), false);
      assert.equal(body.includes(secret), false);
    }
    assert.match(body, /\[REDACTED\]/);
  } finally { await close(server); }
});

test('agent turn API connects local App Server output to run events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-agent-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const run = { id: 'run-1', status: 'running' };
  const events = [];
  const server = createServer({ rootDir: root,
    runService: { getRun: () => run, appendEvent: (event) => { events.push(event); return event; }, listEvents: () => [], subscribe: () => () => {}, close() {} },
    agentAdapter: { runTurn: async (threadId, text) => ({ turn: { id: 'turn-1' }, threadId, text }) }
  });
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/run-1/agent-turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId: 'thread-1', text: 'continue' }) });
    assert.equal(response.status, 200);
    assert.equal(events[0].type, 'agent.turn.completed');
    assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  } finally { await close(server); }
});

test('agent thread API starts a local App Server thread for a run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-thread-api-'));
  await mkdir(join(root, 'estado'), { recursive: true });
  const events = [];
  const server = createServer({ rootDir: root,
    runService: { getRun: () => ({ id: 'run-1', status: 'running' }), appendEvent: (event) => { events.push(event); return event; }, listEvents: () => [], close() {} },
    agentAdapter: { startThread: async (params) => ({ thread: { id: 'thread-1' }, params }) }
  });
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/run-1/agent-thread`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'campaign' }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).thread.id, 'thread-1');
    assert.equal(events[0].type, 'agent.thread.started');
  } finally { await close(server); }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
