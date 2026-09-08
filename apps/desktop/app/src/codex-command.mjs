import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

// Localiza o executável do Codex. Muita gente tem o Codex pelo app desktop da
// OpenAI ou pela extensão do editor, e nenhum dos dois entra no PATH — um
// spawn('codex') falharia mesmo com o Codex instalado e autenticado.
// Ordem: CODEX_COMMAND do .env, PATH, instalações conhecidas.
export function resolveCodexCommand({ configured = '', env = process.env, platform = process.platform, home = homedir() } = {}) {
  if (configured) {
    const isPath = /[\\/]/.test(configured);
    // Caminho configurado e ausente é erro explícito; mantém o caminho para que o
    // spawn falhe exatamente nele, sem procurar outro Codex pela máquina.
    if (isPath && !existsSync(configured)) return { ...notFound(`CODEX_COMMAND aponta para um arquivo que não existe: ${configured}`, 'configuração'), path: configured };
    return found(configured, 'configuração (CODEX_COMMAND)');
  }
  const onPath = findOnPath(env, platform);
  if (onPath) return found(onPath, 'PATH');
  for (const candidate of knownLocations(platform, env, home)) {
    if (existsSync(candidate)) return found(candidate, 'instalação conhecida');
  }
  return notFound('O Codex não foi encontrado neste computador.', null);
}

function found(command, source) {
  // Atalhos .cmd/.bat só rodam através do shell no Windows.
  const shell = /\.(cmd|bat)$/i.test(command);
  return { found: true, command: shell && /\s/.test(command) ? `"${command}"` : command, shell, source, path: command, reason: '' };
}

function notFound(reason, source) {
  return { found: false, command: null, shell: false, source, path: '', reason };
}

function findOnPath(env, platform) {
  const names = platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.bat'] : ['codex'];
  const entries = String(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  for (const dir of entries) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function knownLocations(platform, env, home) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    const roaming = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return [
      ...newestFirst(join(local, 'OpenAI', 'Codex', 'bin')).map((dir) => join(dir, 'codex.exe')),
      ...extensionBinaries(home, join('bin', 'windows-x86_64', 'codex.exe')),
      join(roaming, 'npm', 'codex.cmd')
    ];
  }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const platformDir = platform === 'darwin' ? `darwin-${arch}` : `linux-${arch}`;
  return [
    join(home, '.codex', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    ...extensionBinaries(home, join('bin', platformDir, 'codex'))
  ];
}

// Extensão "openai.chatgpt" do VS Code e do Cursor, versão mais recente primeiro.
function extensionBinaries(home, relative) {
  const result = [];
  for (const editor of ['.vscode', '.cursor']) {
    const root = join(home, editor, 'extensions');
    const versions = listDirectories(root).filter((name) => name.startsWith('openai.chatgpt-')).sort().reverse();
    for (const version of versions) result.push(join(root, version, relative));
  }
  return result;
}

function newestFirst(root) {
  return listDirectories(root)
    .map((name) => join(root, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function listDirectories(root) {
  try { return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); }
  catch { return []; }
}
