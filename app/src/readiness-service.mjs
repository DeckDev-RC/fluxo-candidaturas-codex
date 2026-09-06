// Preparação do computador para o fluxo conduzido pela IA. Substitui o preflight
// herdado do pacote PowerShell (perfil em candidato.md, senha no .env, currículo
// em PDF na pasta): aqui o perfil é a memória confirmada, o login acontece na aba
// do navegador e a IA pergunta o que faltar. Só bloqueia o que impede de fato a
// operação: navegador ausente ou nenhuma plataforma habilitada.

import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const NOMES = { GUPY: 'Gupy', INFOJOBS: 'InfoJobs', PANDAPE: 'PandaPé', LINKEDIN: 'LinkedIn', CATHO: 'Catho', VAGASCOM: 'Vagas.com', SOLIDES: 'Sólides' };

export function createReadinessService({ rootDir, memoryService = null, campaignService = null, runtimeHealth = null, browserTabs = async () => [], browserExecutable = defaultBrowserExecutable, now = () => new Date() } = {}) {
  return {
    // Calcula, grava estado/preflight.json (fonte de installation.ready) e devolve o relatório.
    // `probeAi: false` (partida do processo) não consulta o app-server: a conexão
    // com a IA tem o próprio fluxo de status e não deve nascer de uma verificação.
    async run({ probeAi = true } = {}) {
      const checks = [];
      const [campanha, memoria, saude, abas, navegador] = await Promise.all([
        campaignService?.getCampaign?.().catch(() => ({})) ?? {},
        memoryService?.safeSummary?.().catch(() => ({ facts: {} })) ?? { facts: {} },
        probeAi ? (runtimeHealth?.snapshot?.().catch(() => ({ available: false })) ?? { available: false }) : null,
        Promise.resolve(browserTabs()).catch(() => []),
        browserExecutable().catch(() => ({ ok: false, detail: 'Não foi possível localizar o navegador.' }))
      ]);

      checks.push(check('Navegador para as plataformas', 'critical', navegador.ok, navegador.detail, 'Execute "npm run browser:install" ou reinstale o Fluxo.'));

      const plataformas = (campanha.platforms ?? []).filter((item) => item.enabled !== false && Number(item.goal ?? 0) > 0);
      checks.push(check('Plataformas habilitadas', 'critical', plataformas.length > 0, plataformas.length ? plataformas.map((item) => `${nome(item.name)} (meta ${Number(item.goal)})`).join(', ') : 'Nenhuma plataforma com meta maior que zero.', 'Escolha ao menos uma plataforma e uma meta em "Ajustar plataformas e metas".'));

      const soma = plataformas.reduce((total, item) => total + Number(item.goal ?? 0), 0);
      const metaTotal = Number(campanha.totalGoal ?? 0);
      if (soma > 0 && metaTotal !== soma && campaignService?.updateCampaign) {
        // A meta total é derivada: manter à mão só gerava um aviso perpétuo.
        await campaignService.updateCampaign({ totalGoal: soma }).catch(() => {});
        checks.push(check('Meta total', 'info', true, `Ajustada para ${soma}, a soma das metas por plataforma.`));
      } else {
        checks.push(check('Meta total', 'info', true, soma > 0 ? `${soma} candidaturas confirmadas, somando as plataformas.` : 'Sem meta definida ainda.'));
      }

      const fatos = memoria.facts ?? {};
      const confirmados = ['name', 'email', 'phone', 'targetRoles'].filter((chave) => fatos[chave]?.confirmed === true);
      checks.push(check('Perfil confirmado', 'warning', confirmados.length === 4, confirmados.length === 4 ? 'Nome, e-mail, telefone e objetivo confirmados.' : 'A IA lê o currículo e confirma com você o que faltar antes da primeira candidatura.'));
      checks.push(check('Currículo', 'warning', Boolean(memoria.selectedResume?.path), memoria.selectedResume?.path ? `Em uso: ${String(memoria.selectedResume.path).split('/').at(-1)}` : 'Importe pelo cartão de primeiro uso; a IA lê o documento e confirma os dados com você.'));
      if (saude) checks.push(check('Automação de IA', 'warning', saude.available === true, saude.available === true ? 'ChatGPT conectado.' : 'Conecte o ChatGPT em Configurações para a IA conduzir a busca.'));

      for (const plataforma of plataformas) {
        const aba = (abas ?? []).find((item) => String(item.platform).toUpperCase() === String(plataforma.name).toUpperCase());
        const conectada = Boolean(aba) && aba.loginPending !== true && !aba.challenge;
        checks.push(check(`Acesso: ${nome(plataforma.name)}`, 'info', conectada, conectada ? 'Sessão aberta na aba do navegador.' : 'A IA abre a plataforma na aba do navegador e pede o seu login quando precisar.'));
      }

      const criticasPendentes = checks.filter((item) => item.level === 'critical' && item.status !== 'ok');
      const relatorio = { checkedAt: now().toISOString(), source: 'app', ready: criticasPendentes.length === 0, criticalPending: criticasPendentes.length, warnings: checks.filter((item) => item.level === 'warning' && item.status !== 'ok').length, checks };
      if (rootDir) await writeJsonAtomic(join(rootDir, 'estado', 'preflight.json'), relatorio);
      return relatorio;
    }
  };
}

async function writeJsonAtomic(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  const temporario = `${path}.${process.pid}.tmp`;
  await writeFile(temporario, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporario, path);
}

function check(name, level, ok, detail, fix = '') {
  return { name, level, status: ok ? 'ok' : 'pending', detail, fix };
}

function nome(plataforma) { return NOMES[String(plataforma ?? '').toUpperCase()] ?? String(plataforma ?? ''); }

// O Chromium do Playwright precisa estar instalado; sem ele nenhuma plataforma abre.
async function defaultBrowserExecutable() {
  try {
    const { chromium } = await import('playwright');
    const caminho = chromium.executablePath();
    await access(caminho);
    return { ok: true, detail: 'Chromium do Playwright instalado.' };
  } catch (error) {
    return { ok: false, detail: `Chromium do Playwright não encontrado${error?.message ? ` (${error.message.split('\n')[0]})` : ''}.` };
  }
}
