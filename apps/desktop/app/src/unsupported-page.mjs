import { createDomainError } from './domain/errors.mjs';
import { assertTrustedPage } from './trust-boundary.mjs';

export function detectUnsupportedPage(snapshot = {}, { capability = 'navegação', code = 'unsupported_page' } = {}) {
  // A regra de conteúdo hostil é uma só, na fronteira de confiança.
  assertTrustedPage({ ...snapshot, permissionAsk: snapshot?.permissionAsk ?? snapshot?.maliciousPermissionAsk });
  if (snapshot?.supported === false || snapshot?.emptyResults !== true && !hasRecognizableContent(snapshot)) {
    const error = createDomainError(code, `A capacidade "${capability}" foi pausada: a página ou o DOM não é suportado. O contexto foi preservado e nenhum resultado foi inventado.`);
    error.capability = capability;
    error.preserveContext = true;
    return error;
  }
  return null;
}

function hasRecognizableContent(snapshot) {
  const campos = snapshot?.fieldDetails ?? snapshot?.fields ?? snapshot?.dom?.fields ?? [];
  return Boolean(
    snapshot?.jobs?.length
    || campos.length
    || snapshot?.links?.length
    || snapshot?.applicationStatus
    || snapshot?.confirmationText
  );
}
