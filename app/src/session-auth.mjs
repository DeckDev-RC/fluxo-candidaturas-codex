import { randomBytes } from 'node:crypto';

export function createSessionAuth({ required = false } = {}) {
  const sessionToken = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  return {
    required,
    bootstrap(response) {
      response.setHeader('set-cookie', `fluxo_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`);
      return { authenticated: true, mode: 'loopback', csrfToken };
    },
    authorize(request, { mutation = false } = {}) {
      if (!required) return { ok: true };
      const cookies = parseCookies(request.headers?.cookie);
      if (cookies.fluxo_session !== sessionToken) return { ok: false, status: 401, code: 'session_required', message: 'Sessão local ausente ou expirada.' };
      if (mutation && request.headers?.['x-fluxo-csrf'] !== csrfToken) return { ok: false, status: 403, code: 'csrf_required', message: 'Token CSRF ausente ou inválido.' };
      return { ok: true };
    }
  };
}

function parseCookies(value = '') {
  return Object.fromEntries(String(value).split(';').map((part) => part.trim().split('=')).filter(([key, val]) => key && val));
}
