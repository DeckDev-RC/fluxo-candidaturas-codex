import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REQUIRED_FIELDS = [
  'name', 'email', 'phone', 'location', 'targetRoles', 'seniority', 'technicalFocus', 'workModes',
  'acceptedLocations', 'contracts', 'minimumSalary', 'availability', 'education', 'languages',
  'professionalSummary', 'strengths', 'workAuthorization', 'travel', 'pcd'
];

export function validateOnboarding(input = {}) {
  const missing = REQUIRED_FIELDS.filter((field) => !String(input[field] ?? '').trim());
  if (!input.campaign) missing.push('campaign');
  else {
    for (const field of ['totalGoal', 'dailyGoal', 'weeklyGoal']) {
      if (!Number.isInteger(Number(input.campaign[field])) || Number(input.campaign[field]) < 0) missing.push(`campaign.${field}`);
    }
    if (!Array.isArray(input.campaign.platforms) || !input.campaign.platforms.length) missing.push('campaign.platforms');
  }
  return { valid: missing.length === 0, missing, errors: [] };
}

export function createOnboardingService({ rootDir }) {
  return {
    async saveOnboarding(input) {
      const validation = validateOnboarding(input);
      if (!validation.valid) throw domainError('invalid_onboarding', `Campos ausentes: ${validation.missing.join(', ')}`);
      const platformConfig = await readJson(join(rootDir, 'config', 'plataformas.json'), { platforms: [] });
      const allowed = new Set(asArray(platformConfig.platforms).map((platform) => platform.name));
      for (const platform of input.campaign.platforms) {
        if (!allowed.has(platform.name)) throw domainError('invalid_platform', `Plataforma desconhecida: ${platform.name}`);
        if (!Number.isInteger(Number(platform.goal)) || Number(platform.goal) < 0) throw domainError('invalid_onboarding', `Meta inválida: ${platform.name}`);
      }

      await mkdir(join(rootDir, 'perfil'), { recursive: true });
      await mkdir(join(rootDir, 'campanha'), { recursive: true });
      await mkdir(join(rootDir, 'candidaturas'), { recursive: true });
      await mkdir(join(rootDir, 'fila'), { recursive: true });
      await writeFile(join(rootDir, 'perfil', 'candidato.md'), renderProfile(input), 'utf8');
      await writeJsonAtomic(join(rootDir, 'campanha', 'config.json'), normalizeCampaign(input.campaign));
      await ensureJson(join(rootDir, 'candidaturas', 'candidaturas.json'), []);
      await ensureJson(join(rootDir, 'fila', 'vagas.json'), []);
      return { ready: true, profilePath: 'perfil/candidato.md', campaignPath: 'campanha/config.json' };
    }
  };
}

function renderProfile(input) {
  const value = (field) => String(input[field] ?? '').replace(/\r?\n/g, '<br>');
  return `# Perfil do candidato\n\n> Gerado pelo onboarding visual. Este arquivo é privado.\n\n## Identificação e contato\n\n- Nome completo: ${value('name')}\n- Nome preferido: ${value('socialName')}\n- E-mail: ${value('email')}\n- Telefone/WhatsApp: ${value('phone')}\n- Localização: ${value('location')}\n- LinkedIn: ${value('linkedin')}\n- GitHub: ${value('github')}\n- Portfólio: ${value('portfolio')}\n\n## Objetivo profissional\n\n- Cargos-alvo: ${value('targetRoles')}\n- Senioridade: ${value('seniority')}\n- Foco técnico: ${value('technicalFocus')}\n- Modalidades: ${value('workModes')}\n- Localidades aceitas: ${value('acceptedLocations')}\n- Contratos aceitos: ${value('contracts')}\n- Salário mínimo: ${value('minimumSalary')}\n- Disponibilidade: ${value('availability')}\n\n## Formação e idiomas\n\n- Formação: ${value('education')}\n- Idiomas: ${value('languages')}\n\n## Banco de respostas profissionais\n\n### Resumo profissional\n\n${value('professionalSummary')}\n\n### Pontos fortes\n\n${value('strengths')}\n\n## Elegibilidade e preferências sensíveis\n\n- Autorização de trabalho/visto: ${value('workAuthorization')}\n- Viagens ou mudança: ${value('travel')}\n- Vagas PcD: ${value('pcd')}\n`;
}

function normalizeCampaign(campaign) {
  return {
    name: campaign.name || 'Campanha do onboarding', createdAt: new Date().toISOString(),
    totalGoal: Number(campaign.totalGoal), dailyGoal: Number(campaign.dailyGoal), weeklyGoal: Number(campaign.weeklyGoal),
    deadline: campaign.deadline || '', maxConsecutiveFailures: Number(campaign.maxConsecutiveFailures || 3),
    platforms: campaign.platforms.map((platform) => ({ name: platform.name, enabled: platform.enabled === true, goal: Number(platform.goal) }))
  };
}

async function ensureJson(path, fallback) {
  try { await readFile(path, 'utf8'); } catch (error) { if (error?.code === 'ENOENT') await writeJsonAtomic(path, fallback); else throw error; }
}
async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; } }
async function writeJsonAtomic(path, value) { const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), 'utf8'); await rename(temp, path); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
