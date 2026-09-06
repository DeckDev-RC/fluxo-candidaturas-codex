import { readFluxoState } from '../state-reader.mjs';
import { abrirFluxo, domainError, readJsonBody, respond, sendJson } from './http-helpers.mjs';

// Execuções, jornada do Autopilot, candidaturas e aprovações: onde o Fluxo age.
const CAMINHOS = new Set(['/api/v1/runs', '/api/v1/autopilot/start', '/api/v1/applications/prepare', '/api/v1/approvals']);
const PADROES = {
  run: /^\/api\/v1\/runs\/([^/]+)$/,
  eventos: /^\/api\/v1\/runs\/([^/]+)\/events$/,
  thread: /^\/api\/v1\/runs\/([^/]+)\/agent-thread$/,
  turno: /^\/api\/v1\/runs\/([^/]+)\/agent-turn$/,
  acao: /^\/api\/v1\/runs\/([^/]+)\/(interrupt|resume)$/,
  candidatura: /^\/api\/v1\/applications\/([^/]+)\/(approval|submit)$/,
  eventoCandidatura: /^\/api\/v1\/applications\/([^/]+)\/events$/,
  decisao: /^\/api\/v1\/approvals\/([^/]+)\/decision$/,
  previa: /^\/api\/v1\/approvals\/([^/]+)\/preview$/
};

export function createExecutionRoutes({ rootDir, runService, approvalService, applicationFlow, autopilotService, agentAdapter, followUpService, memoryService, actorResolver }) {
  // O fluxo completo persiste o contexto preparado; um fluxo mínimo depende deste mapa.
  const preparadas = new Map();

  return {
    knows: (path) => CAMINHOS.has(path) || Object.values(PADROES).some((padrao) => padrao.test(path)),
    async handle(request, response, { path, authorization }) {
      const method = request.method;
      const body = () => readJsonBody(request);

      const run = path.match(PADROES.run);
      if (method === 'GET' && run) {
        const encontrada = runService.getRun(decodeURIComponent(run[1]));
        if (!encontrada) sendJson(response, 404, { error: { code: 'run_not_found', message: 'Execução não encontrada.' } });
        else sendJson(response, 200, encontrada);
        return true;
      }

      const eventos = path.match(PADROES.eventos);
      if (method === 'GET' && eventos) return transmitirEventos(request, response, runService, decodeURIComponent(eventos[1]));
      if (method === 'POST' && eventos) return respond(response, 201, async () => runService.appendEvent({ runId: decodeURIComponent(eventos[1]), ...(await body()) }));

      const thread = path.match(PADROES.thread);
      if (method === 'POST' && thread) {
        return respond(response, 201, async () => {
          if (!agentAdapter) throw domainError('agent_unavailable', 'App Server local não está configurado.');
          const runId = decodeURIComponent(thread[1]);
          if (!runService.getRun(runId)) throw domainError('run_not_found', 'Execução não encontrada.');
          const result = await agentAdapter.startThread(await body());
          if (runService.setAgentThread && result?.thread?.id) runService.setAgentThread(runId, result.thread.id);
          const event = runService.appendEvent({ runId, type: 'agent.thread.started', payload: result });
          return { ...result, event };
        });
      }

      const turno = path.match(PADROES.turno);
      if (method === 'POST' && turno) {
        return respond(response, 200, async () => {
          if (!agentAdapter) throw domainError('agent_unavailable', 'App Server local não está configurado.');
          const runId = decodeURIComponent(turno[1]);
          if (!runService.getRun(runId)) throw domainError('run_not_found', 'Execução não encontrada.');
          const input = await body();
          const result = await (agentAdapter.runTurnForRun
            ? agentAdapter.runTurnForRun(runId, String(input.threadId ?? ''), String(input.text ?? ''))
            : agentAdapter.runTurn(String(input.threadId ?? ''), String(input.text ?? '')));
          if (runService.setCurrentTurn && result?.turn?.id) runService.setCurrentTurn(runId, result.turn.id);
          const event = runService.appendEvent({ runId, type: 'agent.turn.started', payload: result });
          return { result, event };
        });
      }

      const acao = path.match(PADROES.acao);
      if (method === 'POST' && acao) {
        return respond(response, 200, async () => {
          const id = decodeURIComponent(acao[1]);
          // Pausa e retomada pela pessoa ficam no histórico da execução: a
          // interface (esta ou outra janela) e a conversa leem o motivo real.
          if (acao[2] === 'interrupt') {
            const pausada = runService.pauseRun(id, 'interrompido pelo usuário');
            runService.appendEvent({ runId: id, type: 'run.paused', payload: { reason: 'interrompido pelo usuário' }, actorType: 'user' });
            if (pausada.agentThreadId && pausada.currentTurnId && agentAdapter?.request) await agentAdapter.request('turn/interrupt', { threadId: pausada.agentThreadId, turnId: pausada.currentTurnId });
            return pausada;
          }
          // Retomar uma candidatura preparada reconcilia a tela observada, nunca reenvia.
          const retomada = applicationFlow?.getPrepared?.(id) ? await applicationFlow.reconcileRun(id) : runService.resumeRun(id);
          runService.appendEvent({ runId: id, type: 'run.resumed', payload: {}, actorType: 'user' });
          return retomada;
        });
      }

      if (method === 'POST' && path === '/api/v1/runs') return respond(response, 201, async () => runService.startRun(await body()));
      if (method === 'POST' && path === '/api/v1/autopilot/start') return respond(response, 201, async () => autopilotService.start(await body()));

      if (method === 'POST' && path === '/api/v1/applications/prepare') {
        if (!applicationFlow) { sendJson(response, 503, { error: { code: 'application_flow_unavailable', message: 'Fluxo de candidatura ainda não está configurado.' } }); return true; }
        return respond(response, 201, async () => {
          const input = await body();
          if (!input.checkpoint) input.checkpoint = (await readFluxoState(rootDir)).checkpoint;
          // Fluxo completo preenche a revisão com a memória; um fluxo mínimo só reserva a vaga.
          const prepared = typeof applicationFlow.prepareForReview === 'function'
            ? await applicationFlow.prepareForReview(input, await memoryService.safeSummary?.())
            : await applicationFlow.prepareNext(input);
          if (prepared?.run?.id) preparadas.set(prepared.run.id, prepared);
          return prepared;
        });
      }

      const candidatura = path.match(PADROES.candidatura);
      if (method === 'POST' && candidatura) {
        if (!applicationFlow) { sendJson(response, 503, { error: { code: 'application_flow_unavailable', message: 'Fluxo de candidatura ainda não está configurado.' } }); return true; }
        const runId = decodeURIComponent(candidatura[1]);
        if (candidatura[2] === 'approval') return respond(response, 201, async () => applicationFlow.requestSubmissionApproval(runId, await body()));
        return respond(response, 200, async () => {
          const prepared = applicationFlow.getPrepared?.(runId) ?? preparadas.get(runId);
          if (!prepared) throw domainError('application_context_missing', 'Contexto de candidatura não está disponível para esta execução.');
          const { approvalId, ...payload } = await body();
          const result = await applicationFlow.submitApproved(prepared, approvalId, payload);
          preparadas.delete(runId);
          return result;
        });
      }

      const eventoCandidatura = path.match(PADROES.eventoCandidatura);
      if (method === 'POST' && eventoCandidatura) return respond(response, 201, async () => followUpService.recordEvent({ reference: decodeURIComponent(eventoCandidatura[1]), ...(await body()) }));

      if (method === 'GET' && path === '/api/v1/approvals') { sendJson(response, 200, approvalService.listApprovals()); return true; }
      if (method === 'POST' && path === '/api/v1/approvals') return respond(response, 201, async () => approvalService.requestApproval(await body()));
      const decisao = path.match(PADROES.decisao);
      if (method === 'POST' && decisao) {
        return respond(response, 200, async () => {
          const input = await body();
          if (input.actorType === 'agent') throw domainError('approval_decision_forbidden', 'Agentes não podem decidir aprovações.');
          return approvalService.decideApproval(decodeURIComponent(decisao[1]), input, actorResolver({ request, authorization }));
        });
      }
      const previa = path.match(PADROES.previa);
      if (method === 'POST' && previa) return respond(response, 200, async () => approvalService.preview(decodeURIComponent(previa[1]), await body()));
      return false;
    }
  };
}

// Eventos do run: histórico completo primeiro e, com `stream=1`, os novos em tempo real.
function transmitirEventos(request, response, runService, runId) {
  if (!runService.getRun(runId)) {
    sendJson(response, 404, { error: { code: 'run_not_found', message: 'Execução não encontrada.' } });
    return true;
  }
  const fluxo = abrirFluxo(request, response);
  const escrever = (event) => fluxo.evento(event.type, event.payloadJson, event.id);
  for (const event of runService.listEvents(runId)) escrever(event);
  const stream = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('stream') === '1';
  if (stream && runService.subscribe) {
    fluxo.aoEncerrar(runService.subscribe(runId, escrever));
    return true;
  }
  fluxo.encerrar();
  response.end();
  return true;
}
