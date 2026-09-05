import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('UI exposes ChatGPT OAuth status and login action without an API-key field', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="openai-auth-button"/);
  assert.match(html, /id="openai-auth-status"/);
  assert.doesNotMatch(html, /OPENAI_API_KEY/);
  assert.match(app, /auth\/openai/);
  assert.match(app, /Entrar com ChatGPT/);
});

test('OAuth window redirects the opened tab without retaining an opener and falls back when blocked', async () => {
  const oauthWindow = await readFile(new URL('../public/oauth-window.js', import.meta.url), 'utf8');
  assert.doesNotMatch(oauthWindow, /window\.open\('about:blank', '_blank', 'noopener'\)/);
  assert.match(oauthWindow, /popup\.opener\s*=\s*null/);
  assert.match(oauthWindow, /popup\.location\.replace\(authUrl\)/);
  assert.match(oauthWindow, /windowRef\.location\.assign\(authUrl\)/);
});
