export function createSkynetAuthService({ host = null } = {}) {
  let last = unavailable();
  const listeners = new Set();

  const service = {
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    handleStatus(status) {
      last = normalize(status);
      notify();
      return true;
    },

    async status() {
      if (!host?.status) return { ...last };
      try { last = normalize(await host.status()); }
      catch { last = unavailable(); }
      return { ...last };
    },

    async startLogin() {
      if (!host?.startLogin) throw domainError('skynet_unavailable', 'O SkynetChat está disponível apenas no aplicativo desktop.');
      try {
        last = normalize(await host.startLogin());
        if (['error', 'unavailable'].includes(last.status)) throw domainError('skynet_login_unavailable', last.message);
        notify();
        return { ...last };
      } catch (error) {
        last = { status: 'error', authenticated: false, provider: 'skynet', message: 'Não foi possível abrir o login do SkynetChat.' };
        notify();
        throw domainError(error?.code ?? 'skynet_login_unavailable', last.message);
      }
    },

    async logout() {
      if (host?.logout) await host.logout();
      last = { status: 'signed_out', authenticated: false, provider: 'skynet', message: 'Sessão do SkynetChat removida.' };
      notify();
      return { ...last };
    }
  };

  return service;

  function notify() {
    for (const listener of listeners) {
      try { listener({ ...last }); } catch { /* observador defeituoso não interrompe login */ }
    }
  }
}

function normalize(value = {}) {
  const authenticated = value.authenticated === true || ['authenticated', 'signed_in'].includes(String(value.status ?? value.state));
  const raw = String(value.status ?? value.state ?? '');
  const status = authenticated ? 'authenticated'
    : raw === 'awaiting_user' ? 'awaiting_user'
      : raw === 'error' ? 'error'
        : raw === 'unavailable' ? 'unavailable' : 'signed_out';
  return {
    status,
    authenticated,
    provider: 'skynet',
    message: String(value.message ?? (authenticated ? 'Conversa do SkynetChat conectada.' : 'Entre no SkynetChat para ativar a conversa.'))
  };
}

function unavailable() {
  return { status: 'unavailable', authenticated: false, provider: 'skynet', message: 'O SkynetChat está disponível apenas no aplicativo desktop.' };
}

function domainError(code, message) {
  return Object.assign(new Error(message), { code });
}
