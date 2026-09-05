import { queryOf, readJsonBody, respond, sanitizePolicyContext } from './http-helpers.mjs';

// Perfil, memória, materiais, descoberta, aderência, exceções, acompanhamento,
// auditoria, avaliações e mensagens: o que o Fluxo sabe e como chegou lá.
const CAMINHOS = new Set([
  '/api/v1/memory', '/api/v1/memory/facts', '/api/v1/intake/preview', '/api/v1/intake/commit',
  '/api/v1/discovery', '/api/v1/discovery/resume', '/api/v1/fit', '/api/v1/fit/override',
  '/api/v1/exceptions', '/api/v1/followup/check', '/api/v1/onboarding',
  '/api/v1/resumes/extract', '/api/v1/resumes/select', '/api/v1/jobs/fit', '/api/v1/evidence',
  '/api/v1/assessments', '/api/v1/assessments/prepare', '/api/v1/imports/legacy', '/api/v1/messages/draft'
]);
const PADROES = [
  /^\/api\/v1\/memory\/facts\/([^/]+)$/,
  /^\/api\/v1\/exceptions\/([^/]+)\/respond$/,
  /^\/api\/v1\/audit\/([^/]+)$/,
  /^\/api\/v1\/audit\/([^/]+)\/export$/,
  /^\/api\/v1\/(assessments|messages)\/approval(?:\/([^/]+)\/assert)?$/
];

export function createKnowledgeRoutes({
  memoryService, intakeService, discoveryService, fitService, exceptionService, followUpMonitor, auditService,
  onboardingService, resumeService, evidenceService, assessmentService, legacyImportService, messageService
}) {
  return {
    knows: (path) => CAMINHOS.has(path) || PADROES.some((padrao) => padrao.test(path)),
    async handle(request, response, { path }) {
      const method = request.method;
      const body = () => readJsonBody(request);

      if (method === 'GET' && path === '/api/v1/memory') return respond(response, 200, () => memoryService.safeSummary());
      if (method === 'POST' && path === '/api/v1/memory/facts') return respond(response, 200, async () => memoryService.upsertFacts((await body()).facts ?? []));
      const fato = path.match(PADROES[0]);
      if (method === 'DELETE' && fato) return respond(response, 200, () => memoryService.removeFact(decodeURIComponent(fato[1])));

      if (method === 'POST' && path === '/api/v1/intake/preview') return respond(response, 200, async () => intakeService.preview(await body()));
      if (method === 'POST' && path === '/api/v1/intake/commit') return respond(response, 200, async () => intakeService.commit(await body()));
      if (method === 'POST' && path === '/api/v1/discovery') return respond(response, 200, async () => discoveryService.discover(await body()));
      if (method === 'POST' && path === '/api/v1/discovery/resume') return respond(response, 200, async () => discoveryService.resume(await body()));
      if (method === 'POST' && path === '/api/v1/fit') return respond(response, 200, async () => fitService.shortlist(await body()));
      if (method === 'POST' && path === '/api/v1/fit/override') return respond(response, 200, async () => fitService.override(await body()));

      if (method === 'GET' && path === '/api/v1/exceptions') return respond(response, 200, () => exceptionService.list(queryOf(request)));
      if (method === 'POST' && path === '/api/v1/exceptions') return respond(response, 201, async () => exceptionService.create(await body()));
      const resposta = path.match(PADROES[1]);
      if (method === 'POST' && resposta) return respond(response, 200, async () => exceptionService.respond(decodeURIComponent(resposta[1]), await body()));

      if (method === 'POST' && path === '/api/v1/followup/check') return respond(response, 200, async () => followUpMonitor.check(await body()));
      const auditoria = path.match(PADROES[2]);
      if (method === 'GET' && auditoria) return respond(response, 200, () => auditService.list(decodeURIComponent(auditoria[1])));
      const exportacao = path.match(PADROES[3]);
      if (method === 'POST' && exportacao) return respond(response, 200, () => auditService.exportPackage({ runId: decodeURIComponent(exportacao[1]) }));

      if (method === 'POST' && path === '/api/v1/onboarding') return respond(response, 200, async () => onboardingService.saveOnboarding(await body()));
      if (method === 'POST' && path === '/api/v1/resumes/extract') return respond(response, 200, async () => resumeService.extract(await body()));
      if (method === 'POST' && path === '/api/v1/resumes/select') return respond(response, 200, async () => resumeService.select(await body()));
      if (method === 'POST' && path === '/api/v1/jobs/fit') return respond(response, 200, async () => resumeService.fit(await body()));
      if (method === 'POST' && path === '/api/v1/evidence') return respond(response, 201, async () => evidenceService.record(await body()));
      if (method === 'POST' && path === '/api/v1/assessments') return respond(response, 201, async () => assessmentService.record(await body()));
      if (method === 'POST' && path === '/api/v1/assessments/prepare') return respond(response, 200, async () => assessmentService.prepare(await body()));
      if (method === 'GET' && path === '/api/v1/assessments') return respond(response, 200, () => assessmentService.list());
      if (method === 'POST' && path === '/api/v1/imports/legacy') return respond(response, 200, async () => legacyImportService.import(await body()));
      if (method === 'POST' && path === '/api/v1/messages/draft') return respond(response, 200, async () => messageService.createDraft(await body()));

      // Aprovação de teste cronometrado e de mensagem: pedir ou conferir.
      const politica = path.match(PADROES[4]);
      if (method === 'POST' && politica) {
        return respond(response, politica[2] ? 200 : 201, async () => {
          const input = await body();
          const contexto = sanitizePolicyContext(input.context);
          const avaliacao = politica[1] === 'assessments';
          const approvalId = politica[2] ? decodeURIComponent(politica[2]) : '';
          if (approvalId) {
            return avaliacao
              ? assessmentService.assertTimedTestApproved({ approvalId, payload: input.payload ?? {}, context: contexto })
              : messageService.assertSendApproved({ approvalId, payload: input.payload ?? {}, context: contexto });
          }
          return avaliacao
            ? assessmentService.requestTimedTestApproval({ ...input, context: contexto })
            : messageService.requestSendApproval({ ...input, context: contexto });
        });
      }
      return false;
    }
  };
}
