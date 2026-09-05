import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skip = new Set(['node_modules', 'dist', 'output', '.git', '.worktrees']);
const artifactsDir = join(root, 'dist', 'desktop');

const inventory = await hashAll(await walk(root));
const artifacts = await hashAll(await installers());
for (const artifact of artifacts) {
  await writeFile(join(root, `${artifact.file}.sha256`), `${artifact.sha256}  ${artifact.file.split('/').at(-1)}\n`, 'utf8');
}

const report = {
  generatedAt: new Date().toISOString(),
  version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
  node: process.version,
  // O piloto privado é distribuído sem assinatura de código; isso precisa ficar explícito.
  signed: false,
  packagePrivate: true,
  credentialsIncluded: false,
  artifacts,
  files: inventory
};
await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output', 'build-inventory.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Inventário: ${inventory.length} arquivos de origem, ${artifacts.length} artefato(s). Versão ${report.version}, não assinado.`);
for (const artifact of artifacts) console.log(`${artifact.file} ${artifact.sha256}`);

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.endsWith('.sqlite') || entry.name === '.env') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else files.push(path);
  }
  return files;
}

async function installers() {
  try {
    return (await readdir(artifactsDir)).filter((name) => name.endsWith('.exe')).map((name) => join(artifactsDir, name));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function hashAll(paths) {
  const result = [];
  for (const path of paths.sort()) {
    const bytes = await readFile(path);
    result.push({ file: relative(root, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  return result;
}
