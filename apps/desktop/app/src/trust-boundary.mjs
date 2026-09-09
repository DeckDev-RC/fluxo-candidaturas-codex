import { createDomainError } from './domain/errors.mjs';

const DANGEROUS = /(?:ignore (?:all )?(?:previous )?instructions|run this shell|exec\(|powershell|cmd\.exe|read all files|approve this submission|grant permission)/i;

export function assertTrustedPage(snapshot = {}) {
  const text = String(snapshot.text ?? snapshot.instruction ?? '');
  if (snapshot.permissionAsk || DANGEROUS.test(text)) {
    throw createDomainError('trust_boundary_violation', 'Conteúdo de vaga não concede permissões, não instrui shell e não aprova pelo usuário.');
  }
}

export function assertTrustedPath(path) {
  const normalized = String(path ?? '').replaceAll('\\', '/');
  if (!normalized || normalized.includes('../') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw createDomainError('invalid_path', 'Caminho fora da raiz autorizada.');
  }
}

export function assertLocalOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(String(origin ?? ''));
  } catch {
    throw createDomainError('local_auth_required', 'Apenas a origem local do aplicativo é aceita.');
  }

  const isLoopbackHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'http:' || !isLoopbackHost) {
    throw createDomainError('local_auth_required', 'Apenas a origem local do aplicativo é aceita.');
  }
}
