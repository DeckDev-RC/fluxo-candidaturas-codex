export const RUNTIME_STATES = ['signed_out', 'signed_in', 'expired', 'unavailable', 'offline'];

export function createRuntimeHealth({ authService, now = () => new Date() } = {}) {
  return {
    async snapshot() {
      try {
        const status = await authService?.status?.();
        return normalize(status, now());
      } catch (error) {
        return {
          state: 'unavailable',
          available: false,
          offlineRead: true,
          message: 'O runtime de IA está indisponível. A leitura local continua disponível.',
          error: String(error?.message ?? error)
        };
      }
    }
  };
}

function normalize(status, now) {
  const raw = String(status?.state ?? status?.status ?? '').toLowerCase();
  const expired = status?.expired === true || raw === 'expired' || (status?.expiresAt && Date.parse(status.expiresAt) <= now.getTime());
  const signedIn = status?.signedIn === true || raw === 'signed_in' || raw === 'authenticated';
  const signedOut = raw === 'signed_out' || raw === 'logged_out' || status?.signedIn === false;
  const state = expired ? 'expired' : signedIn ? 'signed_in' : signedOut ? 'signed_out' : raw === 'unavailable' ? 'unavailable' : signedIn === false ? 'signed_out' : 'unavailable';
  return {
    state,
    available: state === 'signed_in',
    offlineRead: true,
    expiresAt: status?.expiresAt ?? '',
    account: status?.account ? { email: status.account.email ?? '', plan: status.account.plan ?? '' } : null,
    message: messageFor(state)
  };
}

function messageFor(state) {
  if (state === 'signed_in') return 'Runtime autenticado.';
  if (state === 'expired') return 'A sessão do runtime expirou. Entre novamente pelos caminhos do aplicativo.';
  if (state === 'signed_out') return 'Nenhuma sessão do runtime está ativa.';
  return 'O runtime não está disponível neste ambiente. A leitura local continua.';
}
