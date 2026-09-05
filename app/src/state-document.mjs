import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { createAutoPersistence } from './persistence-authority.mjs';

// Uma autoridade por documento de estado. Quando o banco local é a autoridade da
// raiz, memória, exceções, descoberta, acompanhamento, agenda e notificações
// vivem nele; em raiz legada, continuam no arquivo JSON de sempre. Nunca nos dois.
export function createStateDocument({ rootDir = '', persistence: injected, name, file, fallback = {} } = {}) {
  if (!name || !file) throw codedError('state_document_invalid', 'Documento de estado exige nome e arquivo.');
  const owned = injected ? null : createAutoPersistence({ rootDir });
  const persistence = injected ?? owned;

  return {
    name,
    file,
    close() { owned?.close(); },

    async authority() {
      return (await sqlite(persistence)) ? 'sqlite' : 'json';
    },

    async read() {
      if (await sqlite(persistence)) return persistence.readRuntimeDocument(name, fallback);
      return readJson(join(rootDir, file), fallback);
    },

    async write(value) {
      if (await sqlite(persistence)) return persistence.saveRuntimeDocument(name, value);
      await writeJsonAtomic(join(rootDir, file), value);
      return value;
    },

    // Leitura e escrita na mesma autoridade, para quem precisa alterar em bloco.
    async update(transform) {
      const atual = await this.read();
      return this.write(await transform(atual));
    }
  };
}

async function sqlite(persistence) {
  return Boolean(persistence?.isSqliteAuthority && await persistence.isSqliteAuthority());
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return clone(fallback); throw error; }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporario = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporario, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporario, path);
}

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
