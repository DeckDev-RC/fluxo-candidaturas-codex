export function summarizePreflight(preflight) {
  const checks = Array.isArray(preflight?.checks) ? preflight.checks : [];
  const pendingCritical = checks.filter((check) => check.level === 'critical' && check.status === 'pending').length;
  return pendingCritical ? `${pendingCritical} pendência(s) crítica(s) no preflight` : 'Sem pendências críticas registradas';
}
