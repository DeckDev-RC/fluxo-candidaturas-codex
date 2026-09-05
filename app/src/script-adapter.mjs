import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { openAuthoritativePersistence } from './persistence-authority.mjs';

const ALLOWED_SCRIPTS = new Set([
  'adicionar-vaga.ps1', 'calcular-aderencia.ps1', 'exportar-compartilhavel.ps1', 'extrair-curriculo.ps1',
  'gerar-mensagem-recrutador.ps1', 'gerar-painel.ps1', 'importar-controles-legados.ps1', 'inicializar-campanha.ps1',
  'iniciar-sessao-playwright.ps1', 'monitorar-pendencias.ps1', 'nova-candidatura.ps1', 'onboarding.ps1',
  'preflight.ps1', 'primeiro-uso.ps1', 'proxima-acao.ps1', 'registrar-evento.ps1', 'registrar-evidencia.ps1',
  'registrar-falha-fila.ps1', 'registrar-resultado-teste.ps1', 'retomar-fluxo.ps1', 'salvar-checkpoint.ps1',
  'selecionar-curriculo.ps1', 'testar-distribuicao.ps1', 'validar.ps1', 'verificar-playwright.ps1'
]);
const SENSITIVE_OUTPUT = /((?:password|token|cookie|secret|mfa|authorization|credential)\s*["']?\s*[:=]\s*["']?)([^"'\s,}\]]+)/gi;
const SQLITE_BLOCKED_SCRIPTS = new Set(['adicionar-vaga.ps1', 'inicializar-campanha.ps1', 'nova-candidatura.ps1', 'onboarding.ps1', 'registrar-evento.ps1', 'registrar-falha-fila.ps1']);

export async function runAllowedScript(name, args = [], { rootDir, persistence, executable = 'pwsh', timeoutMs = 30_000 } = {}) {
  if (!ALLOWED_SCRIPTS.has(name)) throw domainError('script_not_allowed', `Script não permitido: ${name}`);
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg))) {
    throw domainError('invalid_script_arguments', 'Argumentos inválidos para script.');
  }
  const ownedPersistence = persistence ? null : openAuthoritativePersistence({ rootDir });
  const effectivePersistence = persistence ?? ownedPersistence;
  try {
    if (SQLITE_BLOCKED_SCRIPTS.has(name) && effectivePersistence?.isSqliteAuthority && await effectivePersistence.isSqliteAuthority()) {
      throw domainError('legacy_script_blocked', `O script ${name} altera JSON legado, mas SQLite é a autoridade. Use o serviço da aplicação ou reconcilie explicitamente.`);
    }
    const scriptPath = join(rootDir, 'scripts', name);
    await access(scriptPath);

    return await new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath, ...args], {
      cwd: rootDir,
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      finish({ exitCode: null, stdout, stderr: `${stderr}\nTempo limite excedido.`, ok: false, timedOut: true });
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => finish({ exitCode, stdout, stderr, ok: exitCode === 0, timedOut: false }));

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ...result, stdout: redact(result.stdout), stderr: redact(result.stderr) });
    }
    });
  } finally { ownedPersistence?.close(); }
}

function redact(value) {
  return String(value ?? '').replace(SENSITIVE_OUTPUT, '$1[REDACTED]');
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
