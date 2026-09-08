import { SKYNET_CONSENT_VERSION } from '../conversation-provider-service.mjs';
import { readJsonBody, respond, sendJson } from './http-helpers.mjs';

const PATHS = new Set([
  '/api/v1/auth/skynet',
  '/api/v1/auth/skynet/login',
  '/api/v1/auth/skynet/logout'
]);

export function createSkynetRoutes({ authService = null, conversationService = null, providerService = null } = {}) {
  return {
    knows: (path) => PATHS.has(path),
    async handle(request, response, { path }) {
      if (!PATHS.has(path)) return false;
      if (!authService) {
        sendJson(response, 503, { error: { code: 'skynet_unavailable', message: 'O SkynetChat está disponível apenas no aplicativo desktop.' } });
        return true;
      }
      if (request.method === 'GET' && path === '/api/v1/auth/skynet') return respond(response, 200, () => authService.status());
      if (request.method === 'POST' && path === '/api/v1/auth/skynet/login') return respond(response, 202, async () => {
        const input = await readJsonBody(request);
        if (input.privacyConsent !== true || input.consentVersion !== SKYNET_CONSENT_VERSION || !providerService?.grantConsent) {
          throw Object.assign(new Error('Revise e aceite o envio de dados ao SkynetChat antes do login.'), { code: 'provider_consent_required' });
        }
        await providerService.grantConsent('skynet', input.consentVersion);
        return authService.startLogin();
      });
      if (request.method === 'POST' && path === '/api/v1/auth/skynet/logout') return respond(response, 200, async () => {
        let result; let failure;
        try { result = await authService.logout(); } catch (error) { failure = error; }
        try {
          if (conversationService?.resetProvider) await conversationService.resetProvider('skynet');
          else if (conversationService?.status?.().provider === 'skynet-chat-only') await conversationService.reset();
        } catch (error) { failure ??= error; }
        if (failure) throw failure;
        return result;
      });
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return true;
    }
  };
}
