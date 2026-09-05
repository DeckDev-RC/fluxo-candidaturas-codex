import { createDomainError } from './domain/errors.mjs';

export function detectUnsupportedPage(snapshot = {}, { capability = 'navegação' } = {}) {
  if (snapshot?.maliciousPermissionAsk === true || /ignore previous|run this shell|read all files/i.test(String(snapshot?.text ?? ''))) {
    throw createDomainError('trust_boundary_violation', 'A página tentou expandir permissões. Nenhuma ação foi executada.');
  }
  if (snapshot?.supported === false || snapshot?.emptyResults !== true && !hasRecognizableContent(snapshot)) {
    const error = createDomainError('unsupported_page', `A capacidade "${capability}" foi pausada: a página ou o DOM não é suportado. O contexto foi preservado e nenhum resultado foi inventado.`);
    error.capability = capability;
    error.preserveContext = true;
    return error;
  }
  return null;
}

function hasRecognizableContent(snapshot) {
  return Boolean(snapshot?.jobs?.length || snapshot?.fields?.length || snapshot?.applicationStatus || snapshot?.confirmationText);
}
