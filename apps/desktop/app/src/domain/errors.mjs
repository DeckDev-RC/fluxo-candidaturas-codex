export function createDomainError(code, message, details) {
  const error = new Error(message);
  error.name = 'DomainError';
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}
