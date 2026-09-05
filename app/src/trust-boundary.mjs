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
  if (!['http://127.0.0.1', 'http://localhost'].some((allowed) => String(origin ?? '').startsWith(allowed))) {
    throw createDomainError('local_auth_required', 'Apenas a origem local do aplicativo é aceita.');
  }
}
