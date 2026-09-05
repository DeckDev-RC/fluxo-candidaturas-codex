import { spawn } from 'node:child_process';

export function createCodexAuthService({ command = 'codex', env = process.env, execute = createExecutor(command, env), spawnLogin = null, agentAdapter = null, statusTimeoutMs = 8000 } = {}) {
  let last = { status: 'unknown', authenticated: false, method: 'unknown', message: 'Verificando a sessão do ChatGPT…' };

  return {
    async status() {
      if (agentAdapter?.request) return this.statusFromAgent();
      try {
        const result = await execute(['login', 'status']);
        const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
        const authenticated = result.ok !== false && /logged in using chatgpt|chatgpt/i.test(output) && !/not logged|logged out/i.test(output);
        last = authenticated ? { status: 'authenticated', authenticated: true, method: 'chatgpt', message: 'Login do ChatGPT ativo no Codex.' } : { status: 'signed_out', authenticated: false, method: 'none', message: 'Faça login com sua conta ChatGPT para ativar a IA.' };
      } catch { last = { status: 'unavailable', authenticated: false, method: 'none', message: 'Não foi possível consultar o login local do Codex.' }; }
      return { ...last };
    },

    async statusFromAgent() {
      try {
        // Consulta de status é diagnóstico: um App Server ausente ou lento não pode travar a interface.
        const result = await withDeadline(agentAdapter.request('account/read'), statusTimeoutMs);
        const account = result?.account;
        last = account ? { status: 'authenticated', authenticated: true, method: 'chatgpt', email: String(account.email ?? ''), planType: String(account.planType ?? ''), message: 'Login do ChatGPT ativo no Codex app-server.' } : { status: 'signed_out', authenticated: false, method: 'chatgpt', message: 'O app-server precisa de um login OAuth do ChatGPT.' };
      } catch { last = { status: 'unavailable', authenticated: false, method: 'none', message: 'Não foi possível consultar o login do Codex app-server.' }; }
      return { ...last };
    },

    startLogin({ device = false } = {}) {
      if (agentAdapter?.request) return startAgentLogin(device);
      const state = { status: 'starting', authenticated: false, method: 'chatgpt', mode: device ? 'device' : 'browser', message: device ? 'Login por código iniciado. Conclua no endereço mostrado pelo Codex.' : 'O navegador será aberto para login do ChatGPT.' };
      const args = ['login', ...(device ? ['--device-auth'] : [])];
      const complete = (result) => {
        if (result?.ok) Object.assign(state, { status: 'authenticated', authenticated: true, message: 'Login do ChatGPT concluído.' });
        else Object.assign(state, { status: 'error', authenticated: false, message: 'Não foi possível concluir o OAuth do ChatGPT. Tente novamente pelo navegador ou código de dispositivo.' });
      };
      try {
        if (spawnLogin) {
          const child = spawnLogin(args, { env: safeEnv(env), windowsHide: true });
          child.stdout?.on('data', () => {}); child.stderr?.on('data', () => {});
          child.once('error', () => complete({ ok: false })); child.once('close', (code) => complete({ ok: code === 0 }));
        } else Promise.resolve(execute(args)).then(complete, () => complete({ ok: false }));
      } catch { complete({ ok: false }); }
      last = state;
      return state;
    },

    async logout() { if (agentAdapter?.request) await agentAdapter.request('account/logout', null); else await execute(['logout']); last = { status: 'signed_out', authenticated: false, method: 'none', message: 'Sessão do ChatGPT removida do Codex local.' }; return { ...last }; }
  };

  async function startAgentLogin(device) {
    const state = { status: 'starting', authenticated: false, method: 'chatgpt', mode: device ? 'device' : 'browser', message: device ? 'Use o código de dispositivo para concluir o login do ChatGPT.' : 'Abra o endereço para entrar com sua conta ChatGPT.' };
    try {
      const result = await agentAdapter.request('account/login/start', device ? { type: 'chatgptDeviceCode' } : { type: 'chatgpt', codexStreamlinedLogin: true });
      Object.assign(state, { status: 'awaiting_user', loginId: String(result?.loginId ?? ''), ...(result?.authUrl ? { authUrl: String(result.authUrl) } : {}), ...(result?.userCode ? { userCode: String(result.userCode) } : {}), ...(result?.verificationUrl ? { verificationUrl: String(result.verificationUrl) } : {}) });
    } catch { Object.assign(state, { status: 'error', message: 'Não foi possível iniciar o OAuth no Codex app-server.' }); }
    last = state;
    return { ...state };
  }
}

function withDeadline(promise, timeoutMs) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('O runtime de IA não respondeu no prazo.'), { code: 'runtime_probe_timeout' })), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function safeEnv(input) { const result = { ...input }; for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) delete result[key]; return result; }
function createExecutor(command, env) { return (args) => new Promise((resolve, reject) => { const child = spawn(command, args, { env: safeEnv(env), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let stdout = ''; let stderr = ''; child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; }); child.once('error', reject); child.once('close', (code) => resolve({ ok: code === 0, stdout, stderr })); }); }
