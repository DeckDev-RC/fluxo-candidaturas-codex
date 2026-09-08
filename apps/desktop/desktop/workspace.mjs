import { access, cp, mkdir, copyFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';

const PUBLIC_RESOURCES = ['scripts', 'config', 'templates', 'docs', 'AGENTS.md', 'README.md', 'VERSION', 'CHANGELOG.md', '.env.example', '.gitignore', '.gitattributes'];
const DATA_DIRECTORIES = ['estado', 'perfil', 'curriculo', 'campanha', 'fila', 'candidaturas', 'evidencias', 'mensagens'];

export function validateWorkspaceLocation(rootDir, bundleRoot) {
  const rel = relative(resolve(bundleRoot), resolve(rootDir));
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw Object.assign(new Error('Escolha uma pasta de dados fora da instalação do aplicativo.'), { code: 'workspace_inside_installation' });
  }
  return true;
}

export async function initializeWorkspace({ rootDir, bundleRoot }) {
  validateWorkspaceLocation(rootDir, bundleRoot);
  await mkdir(rootDir, { recursive: true });
  for (const directory of DATA_DIRECTORIES) await mkdir(join(rootDir, directory), { recursive: true });
  for (const resource of PUBLIC_RESOURCES) {
    const source = join(bundleRoot, resource);
    if (await exists(source)) await cp(source, join(rootDir, resource), { recursive: true, force: false, errorOnExist: false });
  }
  if (!(await exists(join(rootDir, '.env'))) && await exists(join(rootDir, '.env.example'))) {
    await copyFile(join(rootDir, '.env.example'), join(rootDir, '.env'));
  }
  return { rootDir: resolve(rootDir) };
}

async function exists(path) { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
