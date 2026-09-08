import { createDomainError } from './domain/errors.mjs';

const ENUMS = {
  platform: new Set(['GUPY', 'INFOJOBS', 'PANDAPE', 'LINKEDIN', 'CATHO', 'VAGASCOM', 'SOLIDES']),
  fieldType: new Set(['text', 'select', 'checkbox', 'radio', 'date', 'file', 'textarea'])
};

export function validateToolInput(name, input = {}, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createDomainError('invalid_tool_arguments', 'Argumentos inválidos.');
  }
  if (input.platform && !ENUMS.platform.has(String(input.platform).toUpperCase())) {
    throw createDomainError('invalid_platform', 'Plataforma fora da enumeração anunciada.');
  }
  if (input.searchUrl && !isHttpUrl(input.searchUrl)) {
    throw createDomainError('invalid_url', 'URL fora do esquema http(s).');
  }
  if (input.path && !isSafeRelative(input.path, ['curriculo/', 'evidencias/', 'perfil/'])) {
    throw createDomainError('invalid_path', 'Caminho fora das pastas autorizadas.');
  }
  if (input.fieldType && !ENUMS.fieldType.has(input.fieldType)) {
    throw createDomainError('invalid_field_type', 'Tipo de campo não anunciado.');
  }
  if (input.runId && context.parentRunId && input.runId === context.parentRunId && name === 'fluxo_submit') {
    throw createDomainError('tool_run_mismatch', 'A candidatura precisa de um run filho vinculado.');
  }
  if (typeof input.limit === 'number' && (input.limit < 0 || input.limit > 100)) {
    throw createDomainError('invalid_limit', 'Limite fora da faixa permitida.');
  }
  return true;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeRelative(value, prefixes) {
  const normalized = String(value).replaceAll('\\', '/');
  return prefixes.some((prefix) => normalized.startsWith(prefix)) && !normalized.includes('../') && !normalized.startsWith('/');
}
