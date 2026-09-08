import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function getFluxoProfileSummary(rootDir) {
  const profilePath = join(rootDir, 'perfil', 'candidato.md');
  const profile = await fileSummary(profilePath);
  const resumes = [];
  try {
    const entries = await readdir(join(rootDir, 'curriculo'), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !['.pdf', '.docx'].includes(extension(entry.name))) continue;
      const summary = await fileSummary(join(rootDir, 'curriculo', entry.name));
      resumes.push({ name: entry.name, extension: extension(entry.name), size: summary.size });
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { profile, resumes };
}

async function fileSummary(path) {
  try {
    const details = await stat(path);
    return { exists: details.isFile(), size: details.isFile() ? details.size : 0 };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, size: 0 };
    throw error;
  }
}

function extension(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}
