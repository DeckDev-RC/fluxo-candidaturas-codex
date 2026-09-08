import { runAllowedScript } from './script-adapter.mjs';

export function createResumeService({ rootDir = '', scriptRunner = (name, args) => runAllowedScript(name, args, { rootDir }) } = {}) {
  return {
    async extract({ path, force = false } = {}) {
      if (!isSafePath(path, 'curriculo')) throw domainError('invalid_resume_path', 'Currículo deve ficar em curriculo/.');
      const args = ['-Path', String(path)]; if (force) args.push('-Force');
      const result = await scriptRunner('extrair-curriculo.ps1', args);
      if (!result?.ok) throw domainError('resume_extraction_failed', 'Não foi possível extrair o currículo.');
      return { path: relativePath(result.stdout, 'curriculo'), commandResult: result };
    },
    async fit({ jobDescription, resumeTextPath = '', requiredTerms = [], excludedTerms = [] } = {}) {
      if (!String(jobDescription ?? '').trim()) throw domainError('invalid_fit_request', 'Descrição da vaga é obrigatória.');
      if (resumeTextPath && !isSafePath(resumeTextPath, 'curriculo')) throw domainError('invalid_resume_path', 'Currículo deve ficar em curriculo/.');
      const args = ['-JobDescription', String(jobDescription)];
      if (resumeTextPath) args.push('-ResumeTextPath', String(resumeTextPath));
      if (requiredTerms.length) args.push('-RequiredTerms', requiredTerms.join(','));
      if (excludedTerms.length) args.push('-ExcludedTerms', excludedTerms.join(','));
      const result = await scriptRunner('calcular-aderencia.ps1', args);
      if (!result?.ok) throw domainError('fit_calculation_failed', 'Não foi possível calcular a aderência.');
      return parseJson(result.stdout);
    },
    async select({ jobDescription } = {}) {
      if (!String(jobDescription ?? '').trim()) throw domainError('invalid_fit_request', 'Descrição da vaga é obrigatória.');
      const result = await scriptRunner('selecionar-curriculo.ps1', ['-JobDescription', String(jobDescription)]);
      if (!result?.ok) throw domainError('resume_selection_failed', 'Não foi possível selecionar um currículo.');
      return { output: String(result.stdout).trim(), commandResult: result };
    }
  };
}

function isSafePath(value, directory) { const normalized = String(value ?? '').replaceAll('\\', '/'); return normalized.startsWith(`${directory}/`) && !normalized.includes('../') && !normalized.startsWith('/'); }
function relativePath(value, fallback) { const line = String(value ?? '').trim().split(/\r?\n/).filter(Boolean).pop() ?? ''; const match = line.replaceAll('\\', '/').match(new RegExp(`(?:^|/)(${fallback}/.+)$`, 'i')); return match?.[1] ?? line; }
function parseJson(value) { try { return JSON.parse(String(value).trim()); } catch { throw domainError('invalid_fit_result', 'O cálculo de aderência retornou um formato inválido.'); } }
function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
