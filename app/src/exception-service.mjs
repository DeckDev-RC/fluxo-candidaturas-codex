import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';

const TYPES = new Set(['pause', 'divergence', 'reconciliation', 'mfa', 'captcha', 'missing_data', 'access_lost', 'session_lost', 'page_lost', 'evidence_missing']);
const HIGH_PRIORITY = new Set(['mfa', 'captcha', 'divergence', 'reconciliation', 'session_lost', 'access_lost']);

export function createExceptionService({ rootDir = '', runService, orchestrator, now = () => new Date(), mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  let boundOrchestrator = orchestrator;
  const service = {
    setOrchestrator(value) { boundOrchestrator = value; },
    async create(input = {}) {
      const type = String(input.type ?? 'pause');
      if (!TYPES.has(type)) throw domainError('invalid_exception_type', 'Tipo de exceção inválido.');
      const timestamp = now().toISOString();
      const exception = { id: randomUUID(), runId: String(input.runId ?? ''), platform: String(input.platform ?? ''), type, priority: HIGH_PRIORITY.has(type) ? 'alta' : 'normal', status: 'open', message: humanMessage(type, input), unblocks: unblockMessage(type, input), nextAction: String(input.action ?? defaultAction(type)), createdAt: timestamp, updatedAt: timestamp, response: '' };
      const state = await readExceptions(rootDir);
      state.push(exception);
      await writeExceptions(rootDir, state);
      if (exception.runId && runService?.pauseRun) { try { runService.pauseRun(exception.runId, exception.message); } catch {} }
      return exception;
    },

    async list({ status = '' } = {}) {
      const values = await readExceptions(rootDir);
      return values.filter((item) => !status || item.status === status).sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || String(right.updatedAt).localeCompare(String(left.updatedAt))).map(safeException);
    },

    async respond(id, { response = '' } = {}) {
      if (!String(response).trim()) throw domainError('exception_response_required', 'Explique o que foi resolvido para retomar.');
      const values = await readExceptions(rootDir);
      const exception = values.find((item) => item.id === id);
      if (!exception) throw domainError('exception_not_found', 'Exceção não encontrada.');
      exception.status = 'resolved'; exception.response = String(response).trim(); exception.updatedAt = now().toISOString();
      await writeExceptions(rootDir, values);
      if (exception.runId && runService?.resumeRun) { try { runService.resumeRun(exception.runId); } catch {} }
      if (exception.runId && boundOrchestrator?.handleHumanEvent) await boundOrchestrator.handleHumanEvent({ runId: exception.runId, kind: 'provided', taskId: exception.id, payload: { response: exception.response } });
      return safeException(exception);
    }
  };
  return wrapMutations(service, ['create', 'respond'], { rootDir, mutationLock, lock });
}

function humanMessage(type, input) {
  const values = { captcha: 'A plataforma pediu um CAPTCHA antes de continuar.', mfa: 'A plataforma pediu uma autenticação em duas etapas.', divergence: 'A tela observada mudou e não corresponde ao próximo passo esperado.', reconciliation: 'O estado local divergiu da última confirmação e precisa ser reconciliado.', missing_data: `Falta confirmar o dado ${String(input.field ?? 'necessário')}.`, access_lost: 'A IA perdeu acesso à plataforma.', session_lost: 'A sessão local da plataforma não está mais disponível.', page_lost: 'A página esperada não está disponível.', evidence_missing: 'A confirmação ocorreu, mas a evidência ainda não foi encontrada.', pause: 'A execução foi pausada para uma decisão do usuário.' };
  return values[type] ?? 'A IA precisa da sua atenção para continuar.';
}
function unblockMessage(type, input) { if (type === 'captcha') return 'Resolver o CAPTCHA no navegador local e responder aqui.'; if (type === 'mfa') return 'Concluir a autenticação no navegador local e responder aqui.'; if (type === 'missing_data') return `Informar ou corrigir ${String(input.field ?? 'o dado solicitado')}.`; if (type === 'divergence' || type === 'reconciliation') return 'Revisar a tela observada e confirmar o próximo passo.'; return 'Seguir a ação sugerida e responder aqui.'; }
function defaultAction(type) { return type === 'missing_data' ? 'Informe o dado para continuar.' : 'Resolva a pendência e retome a execução.'; }
function safeException(item) { const { response, ...safe } = item; return { ...safe, hasResponse: Boolean(response) }; }
function priorityRank(priority) { return priority === 'alta' ? 1 : 2; }
async function readExceptions(rootDir) { try { const data = JSON.parse(await readFile(join(rootDir, 'estado', 'excecoes.json'), 'utf8')); return Array.isArray(data) ? data : []; } catch (error) { if (error?.code === 'ENOENT') return []; throw error; } }
async function writeExceptions(rootDir, value) { const path = join(rootDir, 'estado', 'excecoes.json'); await mkdir(join(rootDir, 'estado'), { recursive: true }); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
