import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLocalRuntime } from '../src/runtime.mjs';
import { createOnboardingService } from '../src/onboarding-service.mjs';

// Cobertura por caminho: cada ferramenta do registro é chamada pela composição
// real do runtime, numa jornada que passa pelos estados que ela existe para
// tratar. Ferramenta registrada e nunca exercitada faz este teste falhar.

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ff1f0003030200f8a2a0680000000049454e44ae426082', 'hex');

test('toda ferramenta registrada é exercitada em uma jornada real, inclusive a reconciliação', { timeout: 60_000 }, async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'fluxo-ferramentas-'));
  const quadro = criarQuadro(raiz);
  const runtime = await createLocalRuntime({ rootDir: raiz, browserDriver: quadro.driver, schedulerTickMs: 3_600_000 });
  const chamadas = new Set();
  const chamar = async (nome, entrada, runId) => { chamadas.add(nome); return runtime.domainTools.call(nome, entrada, runId); };

  try {
    await preparar(runtime, raiz);
    const run = runtime.runService.startRun({ kind: 'autopilot', goal: 'exercitar ferramentas' });

    // Leitura com e sem escopo.
    const estado = await chamar('fluxo_state', {}, run.id);
    assert.ok(estado.campaign);
    assert.deepEqual(Object.keys(await chamar('fluxo_state', { scope: 'queue' }, run.id)), ['queue']);
    // Achado real: a IA pediu scope "summary" e a leitura virou "Não deu certo" na conversa.
    // Escopo desconhecido devolve tudo e explica quais existem.
    const tolerante = await chamar('fluxo_state', { scope: 'inventado' }, run.id);
    assert.ok(tolerante.campaign && tolerante.queue);
    assert.match(tolerante.scopeNote, /"inventado" não existe.*campaign, queue/);
    const perfil = await chamar('fluxo_profile', { scope: 'name' }, run.id);
    assert.equal(perfil.facts.name.value, 'Pessoa Ferramenta');

    // Materiais e lacunas.
    const importado = await chamar('fluxo_import_resume', { filename: 'cv.txt', contentBase64: Buffer.from('Nome: Pessoa Ferramenta\nE-mail: p@example.test\nTelefone: 11999990000\nLocalização: Recife').toString('base64') }, run.id);
    assert.equal(importado.imported, true);
    await chamar('fluxo_record_gap', { key: 'targetRoles', value: 'Engenharia de dados' }, run.id);
    await chamar('fluxo_attach_resume', { path: importado.path, sha256: importado.sha256 }, run.id);
    // A IA lê o currículo selecionado e recebe os dados reconhecidos sem gravá-los.
    const lido = await chamar('fluxo_read_resume', {}, run.id);
    assert.equal(lido.path, importado.path);
    assert.match(lido.text, /Pessoa Ferramenta/);
    assert.equal(lido.recognized.name, undefined, 'dado já confirmado não volta como pendente');
    assert.equal((await runtime.memoryService.safeSummary()).facts.email.confirmed, true);
    await assert.rejects(chamar('fluxo_read_resume', { path: '../fora.txt' }, run.id), { code: 'invalid_path' });
    assert.equal((await runtime.memoryService.safeSummary()).selectedResume.sha256, importado.sha256);

    // Navegador conduzido pela IA: abrir a plataforma na aba dela e ler o que ela pede.
    const aberta = await chamar('fluxo_open_platform', { platform: 'INFOJOBS' }, run.id);
    assert.equal(aberta.loginPending, true);
    assert.equal(quadro.abas[0].platform, 'INFOJOBS');
    assert.match(quadro.abas[0].url, /^https:\/\/www\.infojobs\.com\.br\//);
    assert.equal((await chamar('fluxo_browser_status', {}, run.id)).tabs.length, 1);

    // Busca, aderência e preparação. Só a campanha limita a busca: plataforma fora dela é recusada.
    await assert.rejects(chamar('fluxo_discover', { searchUrl: 'https://quadro.test/jobs', platform: 'GUPY' }, run.id), { code: 'platform_disabled' });
    const busca = await chamar('fluxo_discover', { searchUrl: 'https://quadro.test/jobs', platform: 'INFOJOBS' }, run.id);
    assert.equal(busca.created.length, 1);
    const lista = await chamar('fluxo_shortlist', { limit: 5 }, run.id);
    assert.equal(lista.items.length, 1);
    // A comparação fica gravada na vaga: nota, prioridade e explicação.
    const [avaliada] = (await runtime.queueService.listQueue()).items;
    assert.equal(avaliada.fitScore, lista.items[0].fit.score);
    assert.equal(avaliada.priority, lista.items[0].fit.classification === 'forte' ? 'A' : 'B');
    assert.match(avaliada.fitExplanation, /^Aderência/);

    // Achado real: vagas de uma busca antiga (Ruby) continuavam na fila ao buscar COBOL
    // e a IA não tinha como descartá-las. Descarte a pedido: sai da fila ativa e não
    // volta como novidade; a vaga em uso segue intacta.
    await runtime.queueService.addQueueItem({ platform: 'INFOJOBS', company: 'Antiga Ltda', role: 'Desenvolvedor Ruby Sênior', identifierOrUrl: 'https://quadro.test/jobs/ruby-1' });
    await runtime.queueService.addQueueItem({ platform: 'INFOJOBS', company: 'Outra Antiga', role: 'Ruby on Rails Developer', identifierOrUrl: 'https://quadro.test/jobs/ruby-2' });
    await assert.rejects(chamar('fluxo_discard', { reason: 'sem seletor' }, run.id), { code: 'discard_selector_required' });
    const descarte = await chamar('fluxo_discard', { query: 'ruby', reason: 'a pessoa pediu só COBOL' }, run.id);
    assert.equal(descarte.discarded, 2);
    assert.equal(descarte.remaining, 1);
    const fila = (await runtime.queueService.listQueue()).items;
    assert.deepEqual(fila.filter((item) => item.status === 'descartada').map((item) => item.discardReason), ['a pessoa pediu só COBOL', 'a pessoa pediu só COBOL']);
    await assert.rejects(runtime.queueService.addQueueItem({ platform: 'INFOJOBS', company: 'Antiga Ltda', role: 'Desenvolvedor Ruby Sênior', identifierOrUrl: 'https://quadro.test/jobs/ruby-1' }), { code: 'queue_duplicate' });
    assert.equal((await chamar('fluxo_shortlist', { limit: 5 }, run.id)).items.length, 1, 'a comparação ignora as descartadas');

    // A lista não traz requisitos (nota neutra); ler a página da vaga mede de verdade.
    const lida = await chamar('fluxo_read_job', { itemId: lista.items[0].id }, run.id);
    assert.deepEqual(lida.requirements, ['SQL', 'Python']);
    assert.equal(lida.workMode, 'Remoto');
    assert.equal(lida.fit.score, 50, 'um de dois requisitos batem com o perfil (SQL)');
    const relida = (await runtime.queueService.listQueue()).items.find((item) => item.id === lista.items[0].id);
    assert.deepEqual(relida.requirements, ['SQL', 'Python']);
    assert.equal(relida.fitScore, 50);
    await assert.rejects(chamar('fluxo_read_job', { itemId: 'nao-existe' }, run.id), { code: 'queue_item_not_found' });

    const preparada = await chamar('fluxo_prepare', { itemId: lista.items[0].id }, run.id);
    assert.ok(preparada.run.id);
    await chamar('fluxo_fill', { runId: preparada.run.id, fieldMap: { name: 'name' } }, run.id);
    assert.equal(quadro.pagina.formValues.name, 'Pessoa Ferramenta');

    // Revisão humana: a ferramenta pede, nunca decide.
    const revisao = await chamar('fluxo_review', { runId: preparada.run.id }, run.id);
    assert.equal(revisao.status, 'pending');
    await assert.rejects(chamar('fluxo_submit', { runId: preparada.run.id, approvalId: revisao.id }, run.id), { code: 'approval_required' });
    runtime.approvalService.decideApproval(revisao.id, { decision: 'approved' }, { actorType: 'user', actorId: 'pessoa' });

    // Clique com resultado incerto: o envio não conta e o fluxo pede reconciliação.
    quadro.aoClicar(() => { quadro.pagina.confirmationText = 'Sua candidatura será enviada quando a revisão terminar.'; });
    await assert.rejects(chamar('fluxo_submit', { runId: preparada.run.id, approvalId: revisao.id }, run.id), { code: 'submission_not_confirmed' });
    assert.equal(runtime.applicationFlow.getWorkflow(preparada.run.id).phase, 'needs_reconcile');
    assert.equal((await runtime.persistence.getApplications()).length, 0);

    // A plataforma acabou confirmando: reconciliar registra sem novo clique.
    quadro.pagina.confirmationText = 'Candidatura enviada com sucesso';
    const cliquesAntes = quadro.cliques;
    const reconciliado = await chamar('fluxo_reconcile', { runId: preparada.run.id, phase: 'after_uncertain_click' }, run.id);
    assert.equal(reconciliado.guidance.next.action, 'reconcile');
    assert.equal(quadro.cliques, cliquesAntes, 'reconciliar nunca repete o clique de envio');
    const enviado = await chamar('fluxo_submit', { runId: preparada.run.id, approvalId: revisao.id }, run.id);
    assert.equal(enviado.confirmation.confirmed, true);
    assert.equal((await runtime.persistence.getApplications()).length, 1);
    assert.equal(quadro.cliques, cliquesAntes, 'o envio reconciliado registra o que a plataforma já confirmou');

    // Acompanhamento geral e por candidatura.
    quadro.pagina.applicationStatus = 'triagem';
    quadro.pagina.applicationStatusText = 'Em triagem';
    const novidades = await chamar('fluxo_followup', {}, run.id);
    assert.deepEqual(novidades.failures, []);
    await chamar('fluxo_followup', { reference: enviado.application.id }, run.id);
    await assert.rejects(chamar('fluxo_followup', { reference: 'nao-existe' }, run.id), { code: 'application_not_found' });

    const registradas = runtime.domainTools.definitions.map((item) => item.name).sort();
    const exercitadas = [...chamadas].sort();
    assert.deepEqual(exercitadas, registradas, `ferramenta registrada sem caminho exercitado: ${registradas.filter((nome) => !chamadas.has(nome)).join(', ')}`);
  } finally {
    await runtime.close();
  }
});

async function preparar(runtime, raiz) {
  // O registro de plataformas do produto é o real; só a raiz de dados é sintética.
  await cp(new URL('../../config/', import.meta.url), join(raiz, 'config'), { recursive: true });
  const onboarding = createOnboardingService({ rootDir: raiz, persistence: runtime.persistence, memoryService: runtime.memoryService });
  await onboarding.saveOnboarding({
    name: 'Pessoa Ferramenta', email: 'p@example.test', phone: '11999990000', location: 'Recife', targetRoles: 'Engenharia de dados',
    seniority: 'Pleno', technicalFocus: 'SQL', workModes: 'Remoto', acceptedLocations: 'Brasil', contracts: 'CLT', minimumSalary: '5000',
    availability: 'Imediata', education: 'Graduação', languages: 'Português', professionalSummary: 'Perfil sintético.', strengths: 'SQL',
    workAuthorization: 'Brasil', travel: 'Não', pcd: 'Não informar',
    campaign: { name: 'Ferramentas', totalGoal: 1, dailyGoal: 1, weeklyGoal: 1, platforms: [{ name: 'INFOJOBS', enabled: true, goal: 1 }] }
  });
  await mkdir(join(raiz, 'estado'), { recursive: true });
  await writeFile(join(raiz, 'estado', 'preflight.json'), JSON.stringify({ ready: true, checks: [] }));
}

// Quadro de vagas em memória: uma vaga, um formulário, um botão de envio.
function criarQuadro(raiz) {
  const pagina = {
    url: 'https://quadro.test/jobs',
    text: 'Oportunidades',
    links: [{ text: 'Engenharia de dados', company: 'Empresa Quadro', href: 'https://quadro.test/jobs/1' }],
    fields: [], fieldDetails: [], formValues: {}, jobUrl: '', confirmationText: '', applicationStatus: '', applicationStatusText: ''
  };
  const quadro = {
    pagina,
    cliques: 0,
    abas: [],
    aoClicar(efeito) { quadro.efeitoDoClique = efeito; },
    driver: {
      async openPlatform(platform, url) {
        const aba = { platform, url: String(url), title: 'Entrar', loginPending: true, challenge: null };
        quadro.abas = [aba];
        return aba;
      },
      async tabs() { return quadro.abas; },
      async goto(url) {
        pagina.url = String(url);
        if (pagina.url.endsWith('/jobs/1')) {
          Object.assign(pagina, { text: 'Engenharia de dados', links: [], jobUrl: 'https://quadro.test/jobs/1', fields: ['name', 'submit'], fieldDetails: [{ ref: 'name', name: 'name', label: 'Nome', type: 'text' }, { ref: 'submit', name: 'submit', label: 'Enviar', type: 'submit' }] });
        }
      },
      async snapshot() { return { ...pagina, observedAt: new Date().toISOString() }; },
      async state() { return { ...pagina, observedAt: new Date().toISOString() }; },
      async readJobPage() { return { url: pagina.url, title: 'Vaga', description: 'Engenharia de dados. Trabalho remoto. Requisitos: SQL, Python.', requirements: ['SQL', 'Python'], eliminators: [], workMode: 'Remoto', salary: '' }; },
      async fill(ref, value) { pagina.formValues[ref] = value; },
      async click() { quadro.cliques += 1; quadro.efeitoDoClique?.(); },
      async screenshot(path) {
        const absoluto = resolve(raiz, path);
        await mkdir(join(absoluto, '..'), { recursive: true });
        await writeFile(absoluto, PNG);
        return { ok: true, path };
      },
      async close() {}
    }
  };
  return quadro;
}
