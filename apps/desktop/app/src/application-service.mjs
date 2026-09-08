import { runAllowedScript } from './script-adapter.mjs';
import { acquireFluxoLock, wrapMutations } from './lock.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createAutoPersistence } from './persistence-authority.mjs';
import { APPLICATION_STATUS, transitionApplication } from './domain/application-status.mjs';

export function createApplicationService({ rootDir = '', persistence: injectedPersistence, now = () => new Date(), scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir, persistence }), mutationLock = true, lock = () => acquireFluxoLock(rootDir) }) {
  const ownedPersistence = injectedPersistence ? null : createAutoPersistence({ rootDir });
  const persistence = injectedPersistence ?? ownedPersistence;
  const close = () => ownedPersistence?.close();
  const service = { close,
    async recordConfirmedApplication({ item, confirmation, evidencePath = '', resume = '', applicationId = '', nextAction = 'Aguardar retorno', notes = '' }) {
      if (confirmation?.confirmed !== true) throw domainError('submission_not_confirmed', 'A plataforma não confirmou o recebimento.');
      if (!String(evidencePath).trim()) throw domainError('evidence_required', 'Evidência de confirmação é obrigatória.');
      if (!isSafeRelativePath(evidencePath, 'evidencias')) throw domainError('invalid_evidence_path', 'Evidência deve ficar em evidencias/.');
      if (resume && !isSafeRelativePath(resume, 'curriculo')) throw domainError('invalid_resume_path', 'Currículo deve ficar em curriculo/.');
      for (const field of ['platform', 'company', 'role', 'identifierOrUrl']) {
        if (!String(item?.[field] ?? '').trim()) throw domainError('invalid_application', `${field} é obrigatório.`);
      }

      if (await useSqlite(persistence)) {
        const applications = await persistence.getApplications();
        const key = item.key ?? `${item.platform}|${item.identifierOrUrl}`;
        const evidenceMetadata = await verifyEvidence(rootDir, evidencePath, now);
        const existing = applications.find((entry) => entry.key === key);
        if (existing) {
          if (hasEvidence(existing, evidencePath)) return { record: existing, commandResult: { ok: true, bridge: 'sqlite', idempotent: true } };
          throw domainError('application_duplicate', 'Esta candidatura já está registrada com outra evidência; reconcilie antes de registrar novamente.');
        }
        const timestamp = now().toISOString();
        // A máquina de estados decide se "enviada" é permitido: exige confirmação
        // com horário e evidência verificável, além do estado de origem válido.
        // Situação da fila não é situação de candidatura: quando o item vem da fila,
        // o ponto de partida é "pronta para revisão".
        const conhecidos = new Set(Object.values(APPLICATION_STATUS));
        const transicao = transitionApplication(
          { status: conhecidos.has(item.status) ? item.status : APPLICATION_STATUS.READY_FOR_REVIEW },
          APPLICATION_STATUS.SUBMITTED,
          { confirmation, evidenceMode: 'confirmation', evidence: evidenceMetadata, now: now() }
        );
        const record = {
          ...item,
          id: randomUUID().replaceAll('-', ''),
          queueItemId: item.id ?? '',
          key,
          status: transicao.status,
          submittedAt: timestamp,
          appliedAt: timestamp,
          applicationId: String(applicationId ?? ''),
          resume: String(resume ?? ''),
          evidencePath,
          evidence: [evidencePath],
          evidenceMetadata: [evidenceMetadata],
          nextAction: String(nextAction ?? ''),
          notes: String(notes ?? ''),
          history: Array.isArray(item.history) ? item.history : [],
          createdAt: timestamp,
          updatedAt: timestamp
        };
        applications.push(record);
        const queue = await persistence.getQueue();
        const queueItem = queue.find((entry) => entry.id === item.id || entry.key === key);
        if (queueItem) { queueItem.status = 'processada'; queueItem.updatedAt = timestamp; queueItem.lastError = ''; }
        await persistence.replaceQueueAndApplications({ queue, applications });
        return { record, commandResult: { ok: true, bridge: 'sqlite' } };
      }

      const args = [
        '-Platform', String(item.platform), '-Company', String(item.company), '-Role', String(item.role),
        '-IdentifierOrUrl', String(item.identifierOrUrl), '-Status', 'enviada', '-NextAction', nextAction
      ];
      if (resume) args.push('-Resume', resume);
      if (applicationId) args.push('-ApplicationId', applicationId);
      if (evidencePath) args.push('-Evidence', evidencePath);
      if (notes) args.push('-Notes', notes);

      const commandResult = await scriptRunner('nova-candidatura.ps1', args);
      if (!commandResult?.ok) throw domainError('application_record_failed', 'Não foi possível registrar a candidatura.');
      return { record: parseRecord(commandResult.stdout), commandResult };
    }
  };
  return wrapMutations(service, ['recordConfirmedApplication'], { rootDir, mutationLock, lock });
}

async function useSqlite(persistence) { return Boolean(persistence?.isSqliteAuthority && await persistence.isSqliteAuthority()); }

async function verifyEvidence(rootDir, evidencePath, now) {
  const root = resolve(rootDir);
  const absolute = resolve(root, evidencePath);
  if (relative(root, absolute).startsWith('..')) throw domainError('invalid_evidence_path', 'Evidência deve ficar no diretório Fluxo.');
  try {
    const [content, info] = await Promise.all([readFile(absolute), stat(absolute)]);
    if (!info.isFile()) throw domainError('evidence_unavailable', 'A evidência informada não é um arquivo.');
    return { path: evidencePath, sha256: createHash('sha256').update(content).digest('hex'), size: info.size, verifiedAt: now().toISOString() };
  } catch (error) {
    if (error.code === 'evidence_unavailable') throw error;
    throw domainError('evidence_unavailable', `A evidência precisa existir antes do registro SQLite: ${evidencePath}`);
  }
}
function hasEvidence(record, evidencePath) { return record.evidencePath === evidencePath || (Array.isArray(record.evidence) && record.evidence.includes(evidencePath)); }

function parseRecord(stdout) {
  try {
    return JSON.parse(String(stdout).trim());
  } catch {
    return { status: 'enviada' };
  }
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isSafeRelativePath(value, directory) {
  const normalized = String(value).replaceAll('\\', '/');
  return normalized.startsWith(`${directory}/`) && !normalized.includes('/../') && !normalized.includes('../') && !normalized.startsWith('/');
}
