import { mkdtemp, cp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';

const WRITERS = new Set(['importar-controles-legados.ps1', 'registrar-evidencia.ps1', 'registrar-resultado-teste.ps1', 'proxima-acao.ps1']);
const DOCUMENTS = { campaign: 'campanha/config.json', queue: 'fila/vagas.json', applications: 'candidaturas/candidaturas.json' };
export async function runLegacyBridge({ rootDir, persistence, name, args, execute }) {
  persistence.assertNoDrift();
  const before = await persistence.getOperationalState();
  const stage = await mkdtemp(join(tmpdir(), 'fluxo-legacy-bridge-'));
  try {
    for (const item of ['scripts', 'config', 'templates', 'docs', 'perfil', 'curriculo', '.env', '.env.example', 'AGENTS.md', 'README.md', 'VERSION']) {
      const source = join(rootDir, item);
      if (await exists(source)) await cp(source, join(stage, item), { recursive: true });
    }
    for (const dir of ['estado', 'fila', 'campanha', 'candidaturas', 'evidencias', 'mensagens']) await mkdir(join(stage, dir), { recursive: true });
    for (const [key, path] of Object.entries(DOCUMENTS)) await writeFile(join(stage, path), JSON.stringify(before[key]), 'utf8');
    const legacyApplications = before.applications.map(item => ({ id: '', key: '', platform: '', company: '', role: '', identifierOrUrl: '', applicationId: '', workMode: '', resume: '', source: '', notes: '', appliedAt: '', submittedAt: '', createdAt: '', updatedAt: '', lastCheckedAt: '', nextAction: '', nextActionAt: '', deadline: '', status: 'rascunho', evidence: [], assessment: null, history: [], ...item }));
    await writeFile(join(stage, DOCUMENTS.applications), JSON.stringify(legacyApplications), 'utf8');
    await writeFile(join(stage, DOCUMENTS.campaign), JSON.stringify({ totalGoal: 0, dailyGoal: 0, weeklyGoal: 0, platforms: [], ...before.campaign }), 'utf8');
    const stagedArgs = [...args];
    for (const flag of ['-SourcePath', '-Directory']) {
      const index = stagedArgs.indexOf(flag);
      if (index >= 0 && stagedArgs[index + 1]) stagedArgs[index + 1] = resolve(rootDir, stagedArgs[index + 1]);
    }
    const result = await execute(stage, stagedArgs);
    if (WRITERS.has(name) && result.ok) {
      const after = {};
      for (const [key, path] of Object.entries(DOCUMENTS)) after[key] = JSON.parse(await readFile(join(stage, path), 'utf8'));
      after.applications = (Array.isArray(after.applications) ? after.applications : [after.applications]).map(item => ({ ...item, evidence: Array.isArray(item.evidence) ? item.evidence : item.evidence ? [item.evidence] : [], history: Array.isArray(item.history) ? item.history : item.history ? [item.history] : [] }));
      // Ordinary compatibility operations cannot manufacture a new submitted application.
      if (name !== 'importar-controles-legados.ps1') {
        for (const application of after.applications) {
          const previous = before.applications.find(item => item.id === application.id || item.key === application.key);
          if (!previous) throw failure('legacy_unconfirmed_application');
        }
      }
      await persistence.replaceOperationalState(after);
      result.imported = after.applications.filter(item => !before.applications.some(previous => previous.key === item.key)).length;
    }
    for (const dir of ['evidencias', 'mensagens']) await cp(join(stage, dir), join(rootDir, dir), { recursive: true, force: false });
    for (const file of ['painel.md', 'controle-candidaturas.md']) if (await exists(join(stage, 'candidaturas', file))) await cp(join(stage, 'candidaturas', file), join(rootDir, 'candidaturas', file));
    if (name === 'preflight.ps1') {
      for (const file of ['preflight.json', 'preflight.md']) if (await exists(join(stage, 'estado', file))) {
        const content = (await readFile(join(stage, 'estado', file), 'utf8')).replaceAll(stage.replaceAll('\\', '\\\\'), rootDir.replaceAll('\\', '\\\\')).replaceAll(stage, rootDir);
        await writeFile(join(rootDir, 'estado', file), content, 'utf8');
      }
    }
    return { ...result, bridge: 'sqlite', stdout: result.stdout.replaceAll(stage, rootDir), stderr: result.stderr.replaceAll(stage, rootDir) };
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(stage));
    if (rel && !rel.startsWith('..') && !isAbsolute(rel) && rel.startsWith('fluxo-legacy-bridge-')) await rm(stage, { recursive: true, force: true });
  }
}
async function exists(path) { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function failure(code) { return Object.assign(new Error('A operação legada tentou criar uma candidatura não confirmada.'), { code }); }
