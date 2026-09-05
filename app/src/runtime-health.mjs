export const RUNTIME_STATES = ['signed_out', 'signed_in', 'expired', 'unavailable', 'offline'];

export const CODEX_MISSING_GUIDANCE = 'Instale o Codex CLI (npm install -g @openai/codex) ou informe o caminho do executável em CODEX_COMMAND no arquivo .env e clique em "Verificar novamente".';

// `codex` é opcional: quando informado, resolve o executável e permite explicar
// a indisponibilidade mais comum — o Codex não está instalado ou não foi encontrado.
export function createRuntimeHealth({ authService, codex = null, now = () => new Date() } = {}) {
  return {
    async snapshot() {
      const executable = codex ? codex() : null;
      if (executable && !executable.found) {
        return {
          state: 'unavailable',
          available: false,
          offlineRead: true,
          reason: 'codex_not_found',
          message: `Automação indisponível — ${executable.reason} ${CODEX_MISSING_GUIDANCE}`,
          codex: { found: false, path: '', source: executable.source ?? '' }
        };
      }
      try {
        const status = await authService?.status?.();
        return { ...normalize(status, now()), ...(executable ? { codex: { found: true, path: executable.path, source: executable.source } } : {}) };
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
  // Sem evidência positiva, o estado é "indisponível": afirmar que a pessoa está
  // desconectada é uma afirmação, e ela precisa vir do runtime.
  const bruto = expired ? 'expired' : signedIn ? 'signed_in' : signedOut ? 'signed_out' : 'unavailable';
  const state = RUNTIME_STATES.includes(bruto) ? bruto : 'unavailable';
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
