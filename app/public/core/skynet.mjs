import { read, send } from './api.mjs';

export function loadSkynetStatus() {
  return read('/api/v1/auth/skynet', { fallback: null });
}

export function loginSkynet() {
  return send('/api/v1/auth/skynet/login', {});
}

export function logoutSkynet() {
  return send('/api/v1/auth/skynet/logout', {});
}
