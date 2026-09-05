import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { createPolicyGateway } from './policy.mjs';

export function createAssessmentService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }), readApplications = () => readJson(join(rootDir, 'candidaturas', 'candidaturas.json'), []), policyGateway: injectedPolicyGateway, mutationLock = true, lock = () => acquireFluxoLock(rootDir) } = {}) {
  const policyGateway = injectedPolicyGateway ?? createPolicyGateway();
  const service = { async record({ reference, testName, provider = '', url = '', status = 'concluído', score = '', total = '', evidence = '', notes = '' } = {}) {
    if (!String(reference ?? '').trim() || !String(testName ?? '').trim()) throw domainError('invalid_assessment', 'Referência e nome do teste são obrigatórios.');
    const args = ['-Reference', reference, '-TestName', testName, '-Status', status];
    for (const [flag, value] of [['-Provider', provider], ['-Url', url], ['-Score', score], ['-Total', total], ['-Evidence', evidence], ['-Notes', notes]]) if (value) args.push(flag, String(value));
    const result = await scriptRunner('registrar-resultado-teste.ps1', args);
    if (!result?.ok) throw domainError('assessment_record_failed', 'Não foi possível registrar o resultado do teste.');
    return { result: parseJsonOrText(result.stdout), commandResult: result };
  }, async list() { const applications = await readApplications(); return applications.filter((item) => item.assessment).map((item) => ({ reference: item.id ?? item.key, ...item.assessment })); },
  requestTimedTestApproval({ runId, payload, context = {}, ttlMs } = {}) {
    return policyGateway.requestApproval({ runId, action: { kind: 'timed_test', version: 'v1' }, payload, context, ttlMs });
  },
  assertTimedTestApproved({ approvalId, payload, context = {} } = {}) {
    return policyGateway.assertApproved({ approvalId, action: { kind: 'timed_test', version: 'v1' }, payload, context });
  },
  async prepare({ name, questions = [], durationSeconds = 0 } = {}) {
    if (!String(name ?? '').trim() || !Array.isArray(questions) || !questions.length) throw domainError('invalid_questionnaire', 'Nome e perguntas são obrigatórios.');
    const duration = Number(durationSeconds);
    if (!Number.isInteger(duration) || duration < 0 || duration > 24 * 60 * 60) throw domainError('invalid_questionnaire', 'Duração inválida.');
    return { name: String(name), questions: questions.map((question, index) => ({ id: String(question.id ?? `q-${index + 1}`), prompt: String(question.prompt ?? ''), required: question.required !== false })), timed: duration > 0, durationSeconds: duration, timerMode: 'informativo', requiresUserInput: true, automatedSubmission: false, policy: duration > 0 ? policyGateway.evaluate({ kind: 'timed_test', version: 'v1' }) : policyGateway.evaluate({ kind: 'assessment', version: 'v1' }) };
  } };
  return wrapMutations(service, ['record'], { rootDir, mutationLock, lock });
}
function parseJsonOrText(value) { try { return JSON.parse(String(value).trim()); } catch { return { output: String(value ?? '').trim() }; } }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; } }
