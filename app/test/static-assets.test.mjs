import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/http-server.mjs';

test('GET / serves the read-only Fluxo dashboard without secrets', async () => {
  const server = createServer({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-harness-ui-')) });
  const address = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.match(body, /Fluxo de candidaturas/);
    assert.match(body, /run-preflight/);
    assert.match(body, /campaign-platforms/);
    assert.match(body, /approval-list/);
    assert.match(body, /export-shareable/);
    assert.equal(body.includes('GUPY_PASSWORD'), false);
  } finally {
    await close(server);
  }
});

test('static assets have their expected content types and traversal is rejected', async () => {
  const server = createServer({ rootDir: await mkdtemp(join(tmpdir(), 'fluxo-harness-ui-')) });
  const address = await listen(server);

  try {
    const script = await fetch(`http://127.0.0.1:${address.port}/app.js`);
    const preflightSummary = await fetch(`http://127.0.0.1:${address.port}/preflight-summary.js`);
    const oauthWindow = await fetch(`http://127.0.0.1:${address.port}/oauth-window.js`);
    const styles = await fetch(`http://127.0.0.1:${address.port}/styles.css`);
    const favicon = await fetch(`http://127.0.0.1:${address.port}/favicon.svg`);
    const traversal = await fetch(`http://127.0.0.1:${address.port}/../README.md`);

    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /^text\/javascript/);
    assert.equal(preflightSummary.status, 200);
    assert.match(preflightSummary.headers.get('content-type'), /^text\/javascript/);
    assert.equal(oauthWindow.status, 200);
    assert.match(oauthWindow.headers.get('content-type'), /^text\/javascript/);
    assert.equal(styles.status, 200);
    assert.match(styles.headers.get('content-type'), /^text\/css/);
    assert.equal(favicon.status, 200);
    assert.match(favicon.headers.get('content-type'), /^image\/svg\+xml/);
    assert.equal(traversal.status, 404);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
