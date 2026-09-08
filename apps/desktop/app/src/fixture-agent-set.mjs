import { readFile } from 'node:fs/promises';

export function createFixtureAgents({ rootDir = '', intakeService, discoveryService, fitService, followUpMonitor } = {}) {
  return {
    intake: { async run(context) { const resumePath = context.input?.resumePath ?? 'curriculo/fixture.txt'; const text = context.input?.resumeText ?? await readFixtureResume(rootDir, resumePath); const preview = await intakeService.preview({ source: resumePath, text, documents: text ? [{ path: resumePath, text }] : [] }); return { status: 'succeeded', tool: 'file', observation: 'Perfil local lido e perguntas mínimas identificadas.', result: preview, confirmed: true, confidence: 'alta' }; } },
    discovery: { async run(context) { const result = await discoveryService.discover({ ...context.input, runId: context.runId, platforms: context.input?.platforms?.length ? context.input.platforms : ['GUPY'] }); return { status: 'succeeded', tool: 'fixture', observation: `Encontrei ${result.created.length} oportunidade(s) localmente.`, result, confirmed: true, confidence: 'alta' }; } },
    fit: { async run(context) { const intake = context.outputs.intake ?? {}; const discovery = context.outputs.discovery ?? {}; const memoryFacts = intake.facts ?? {}; const result = fitService.shortlist({ opportunities: discovery.created ?? discovery.opportunities ?? [], facts: memoryFacts, limit: Number(context.input?.limit ?? 10) }); return { status: 'succeeded', tool: 'script', observation: `Comparei ${result.items.length} oportunidade(s) com o contexto confirmado.`, result, confirmed: true, confidence: 'média' }; } },
    application: { async run(context) { const selected = context.outputs.fit?.items ?? []; return { status: 'succeeded', tool: 'fixture', observation: selected.length ? 'Preparei a próxima candidatura em ambiente de demonstração.' : 'Nenhuma candidatura foi preparada sem uma oportunidade elegível.', result: { prepared: selected.length, externalAction: false, evidence: selected.length ? 'fixture://confirmation' : '' }, confirmed: true, confidence: 'alta' }; } },
    followup: { async run(context) { const result = await followUpMonitor.check({ applications: context.input?.applications ?? [], instruction: context.input?.instruction ?? 'acompanhe tudo desta semana' }); return { status: 'succeeded', tool: 'fixture', observation: result.summary, result, confirmed: true, confidence: 'alta' }; } }
  };
}

export async function readFixtureResume(rootDir, path) { try { return await readFile(`${rootDir}/${String(path).replaceAll('\\', '/')}`, 'utf8'); } catch { return ''; } }

export function createFixtureDiscoveryAdapters() {
  const jobs = [
    { id: 'fixture-gupy-1', title: 'Desenvolvedor backend', company: 'Acme Tecnologia', location: 'Remoto', modality: 'Remoto', url: 'fixture://gupy/backend-1', requirements: ['Node.js', 'SQL'], deadline: '2026-09-10' },
    { id: 'fixture-linkedin-1', title: 'Analista de dados', company: 'Núcleo Digital', location: 'São Paulo', modality: 'Híbrido', url: 'fixture://linkedin/dados-1', requirements: ['SQL', 'Python'], deadline: '2026-09-12' }
  ];
  return Object.fromEntries(['GUPY', 'LINKEDIN', 'INFOJOBS', 'PANDAPE', 'CATHO', 'VAGASCOM', 'SOLIDES'].map((platform) => [platform, { async search(criteria = {}) { return jobs.filter((job) => String(job.url).toLocaleLowerCase().includes(platform.toLocaleLowerCase()) || platform === 'GUPY' && job.id.startsWith('fixture-gupy')).filter((job) => !criteria.roles?.length || criteria.roles.some((role) => job.title.toLocaleLowerCase().includes(String(role).toLocaleLowerCase()))); } }]));
}
