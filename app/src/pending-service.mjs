import { runAllowedScript } from './script-adapter.mjs';
import { openAuthoritativePersistence } from './persistence-authority.mjs';

export function createPendingService({ rootDir = '', persistence = openAuthoritativePersistence({ rootDir }), now = () => new Date(), scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir, persistence }) } = {}) {
  return { async list({ dueWithinDays = 7 } = {}) {
    const days = Number(dueWithinDays); if (!Number.isInteger(days) || days < 0 || days > 365) throw domainError('invalid_pending_window', 'Janela de pendências inválida.');
    if (persistence?.isSqliteAuthority && await persistence.isSqliteAuthority()) {
      const limit = now().getTime() + days * 24 * 60 * 60 * 1000;
      return (await persistence.getApplications()).filter((item) => {
        const due = Date.parse(item.nextActionAt ?? item.deadline ?? '');
        return String(item.nextAction ?? '').trim() && (!Number.isFinite(due) || due <= limit);
      });
    }
    const result = await scriptRunner('monitorar-pendencias.ps1', ['-DueWithinDays', String(days), '-AsJson']);
    if (!result?.ok) throw domainError('pending_read_failed', 'Não foi possível consultar pendências.');
    const output = String(result.stdout ?? '').trim();
    if (!output) return [];
    try { const parsed = JSON.parse(output); return Array.isArray(parsed) ? parsed : parsed ? [parsed] : []; } catch { throw domainError('invalid_pending_result', 'Pendências retornaram formato inválido.'); }
  } };
}
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
