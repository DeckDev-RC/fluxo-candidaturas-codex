import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDomainError } from './domain/errors.mjs';

export function createSessionStore({ rootDir, now = () => new Date() } = {}) {
  return {
    async save({ platform, profile = 'candidaturas', expiresAt = '' } = {}) {
      const state = await read(rootDir);
      state.sessions[key(platform, profile)] = { platform, profile, updatedAt: now().toISOString(), expiresAt, private: true };
      await write(rootDir, state);
      return state.sessions[key(platform, profile)];
    },

    async get(platform, profile = 'candidaturas') {
      const session = (await read(rootDir)).sessions[key(platform, profile)];
      if (!session) return { exists: false, expired: false };
      const expired = session.expiresAt && Date.parse(session.expiresAt) <= now().getTime();
      return { ...session, exists: true, expired };
    },

    async requireOpen(platform, profile = 'candidaturas') {
      const session = await this.get(platform, profile);
      if (session.expired) throw createDomainError('session_expired', 'A sessão autenticada expirou. Faça login novamente. MFA/CAPTCHA/biometria pausam sem tentativa de contorno.');
      return session;
    }
  };
}

function key(platform, profile) { return `${String(platform).toUpperCase()}|${profile}`; }
async function read(rootDir) {
  try { return JSON.parse(await readFile(join(rootDir, 'estado', 'sessoes.json'), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { sessions: {} }; throw error; }
}
async function write(rootDir, value) {
  const path = join(rootDir, 'estado', 'sessoes.json');
  await mkdir(join(rootDir, 'estado'), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, path);
}
