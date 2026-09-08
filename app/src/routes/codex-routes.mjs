import { readJsonBody, respond, sendJson } from './http-helpers.mjs';

// Sessão local, login do ChatGPT e painel do Codex.
const CAMINHOS = new Set([
  '/api/v1/auth/session', '/api/v1/auth/openai', '/api/v1/auth/openai/login', '/api/v1/auth/openai/logout',
  '/api/v1/codex', '/api/v1/codex/refresh', '/api/v1/codex/settings'
]);

export function createCodexRoutes({ sessionAuth, authService, codexHarnessService, codexSettingsService, conversationService = null }) {
  const snapshot = async (refresh = false) => ({
    ...(refresh && codexHarnessService.refresh ? await codexHarnessService.refresh() : await codexHarnessService.snapshot()),
    settings: await codexSettingsService.get()
  });

  return {
    knows: (path) => CAMINHOS.has(path),
    async handle(request, response, { path }) {
      const method = request.method;
      if (method === 'GET' && path === '/api/v1/auth/session') { sendJson(response, 200, sessionAuth.bootstrap(response)); return true; }
      if (method === 'GET' && path === '/api/v1/auth/openai') return respond(response, 200, () => authService.status());
      if (method === 'POST' && path === '/api/v1/auth/openai/login') return respond(response, 202, async () => authService.startLogin(await readJsonBody(request)));
      if (method === 'POST' && path === '/api/v1/auth/openai/logout') return respond(response, 200, async () => {
        const result = await authService.logout();
        await conversationService?.resetProvider?.('codex');
        return result;
      });
      if (method === 'GET' && path === '/api/v1/codex') return respond(response, 200, () => snapshot());
      if (method === 'POST' && path === '/api/v1/codex/refresh') return respond(response, 200, () => snapshot(true));
      if (method === 'GET' && path === '/api/v1/codex/settings') return respond(response, 200, () => codexSettingsService.get());
      if (method === 'PUT' && path === '/api/v1/codex/settings') return respond(response, 200, async () => codexSettingsService.update(await readJsonBody(request)));
      return false;
    }
  };
}

export function createUnavailableCodexHarness() {
  const value = { status: 'unavailable', account: null, usage: null, rateLimits: null, models: [], error: { code: 'agent_unavailable', message: 'Codex app-server local não está configurado.' } };
  return { async snapshot() { return value; }, async refresh() { return value; } };
}
