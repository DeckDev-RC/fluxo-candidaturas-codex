export const RUNTIME_STATES = ['signed_out', 'signed_in', 'expired', 'unavailable', 'offline'];

export const CODEX_MISSING_GUIDANCE = 'Instale o Codex CLI (npm install -g @openai/codex) ou informe o caminho do executável em CODEX_COMMAND no arquivo .env e clique em "Verificar novamente".';

// `codex` é opcional: quando informado, resolve o executável e permite explicar
// a indisponibilidade mais comum — o Codex não está instalado ou não foi encontrado.
export function createRuntimeHealth({ authService, skynetAuthService = null, providerService = null, conversationProvider = 'codex', codex = null, now = () => new Date() } = {}) {
  const activeProvider = () => providerService?.get?.() ?? (conversationProvider === 'skynet' ? 'skynet' : 'codex');
  return {
    // Login, logout ou escolha de provedor atualizam o mesmo retrato composto.
    onChange(listener) {
      const notify = async () => { listener(await this.snapshot()); };
      const unsubscribes = [
        authService?.onChange?.(notify),
        skynetAuthService?.onChange?.(notify),
        providerService?.onChange?.(notify)
      ].filter((value) => typeof value === 'function');
      return () => { for (const unsubscribe of unsubscribes) unsubscribe(); };
    },

    async snapshot() {
      const provider = activeProvider();
      const [codexState, skynetState] = await Promise.all([
        codexSnapshot(authService, codex, now),
        skynetSnapshot(skynetAuthService, now)
      ]);
      return compose(provider, codexState, skynetState, providerService?.snapshot?.() ?? null);
    }
  };
}

async function codexSnapshot(authService, codex, now) {
  const executable = codex ? codex() : null;
  if (executable && !executable.found) {
    return {
      state: 'unavailable',
      available: false,
      offlineRead: true,
      reason: 'codex_not_found',
      message: `Automação indisponível — ${executable.reason} ${CODEX_MISSING_GUIDANCE}`,
      executable: { found: false, path: '', source: executable.source ?? '' }
    };
  }
  try {
    const status = await authService?.status?.();
    return {
      ...normalize(status, now()),
      ...(executable ? { executable: { found: true, path: executable.path, source: executable.source } } : {})
    };
  } catch (error) {
    return { state: 'unavailable', available: false, offlineRead: true, message: 'O runtime Codex está indisponível.', error: String(error?.message ?? error) };
  }
}

async function skynetSnapshot(authService, now) {
  if (!authService?.status) {
    return { state: 'unavailable', available: false, offlineRead: true, message: 'O SkynetChat está disponível apenas no aplicativo desktop.' };
  }
  try {
    const status = await authService.status();
    const value = normalize(status, now());
    return { ...value, message: String(status?.message ?? value.message) };
  } catch {
    return { state: 'unavailable', available: false, offlineRead: true, message: 'Não foi possível verificar a sessão do SkynetChat.' };
  }
}

function compose(provider, codex, skynet, preferences) {
  const active = provider === 'skynet' ? skynet : codex;
  const chat = active.available === true;
  const tools = codex.available === true;
  const available = provider === 'skynet' ? chat || tools : chat;
  const mode = available ? (provider === 'skynet' ? 'skynet-hybrid' : 'codex-app-server') : 'offline-read';
  const message = provider === 'skynet'
    ? chat
      ? (tools ? 'SkynetChat conectado para conversa e Codex conectado para operações.' : 'SkynetChat conectado; entre no ChatGPT/Codex para operar plataformas.')
      : tools ? 'Codex conectado para operações; entre no SkynetChat para conversa textual.' : skynet.message
    : codex.message;
  return {
    ...active,
    state: available ? 'signed_in' : active.state,
    available,
    offlineRead: true,
    provider,
    conversationProvider: provider,
    mode,
    message,
    capabilities: { chat, tools, autopilot: tools },
    providers: { codex, skynet },
    ...(preferences ? { providerPreferences: preferences } : {}),
    // Compatibilidade com o painel Codex existente.
    ...(codex.executable ? { codex: codex.executable } : {})
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
    message: messageFor(state),
    // Falha de login é dita com a causa: sem isso a pessoa só vê "indisponível".
    ...(raw === 'error' && status?.message ? { loginError: String(status.message) } : {})
  };
}

function messageFor(state) {
  if (state === 'signed_in') return 'Runtime autenticado.';
  if (state === 'expired') return 'A sessão do runtime expirou. Entre novamente pelos caminhos do aplicativo.';
  if (state === 'signed_out') return 'Nenhuma sessão do runtime está ativa.';
  return 'O runtime não está disponível neste ambiente. A leitura local continua.';
}
