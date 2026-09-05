import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { extractDocumentText, writeExtractedText } from './document-extract.mjs';
import { createDomainError } from './domain/errors.mjs';

const ALLOWED = new Set(['.pdf', '.docx', '.txt']);
const MAX_BYTES = 8 * 1024 * 1024;

export function createResumeImportService({ rootDir, memoryService } = {}) {
  return {
    async importFile({ filename = '', contentBase64 = '', label = '' } = {}) {
      const safeName = sanitizeName(filename);
      const extension = extname(safeName).toLowerCase();
      if (!ALLOWED.has(extension)) throw createDomainError('unsupported_resume_format', 'Formato aceito: PDF, DOCX ou TXT.');
      const bytes = decodeBase64(contentBase64);
      if (bytes.length < 20) throw createDomainError('resume_corrupt_or_empty', 'O arquivo está vazio ou incompleto. Nada foi anunciado como importado.');
      if (bytes.length > MAX_BYTES) throw createDomainError('resume_too_large', 'O currículo excede 8 MB.');
      const expectedSha = createHash('sha256').update(bytes).digest('hex');
      const relative = `curriculo/${safeName}`;
      await mkdir(join(rootDir, 'curriculo'), { recursive: true });
      const absolute = join(rootDir, relative);
      await writeFile(absolute, bytes);
      const stored = await readFile(absolute);
      const actualSha = createHash('sha256').update(stored).digest('hex');
      if (actualSha !== expectedSha || stored.length !== bytes.length) {
        throw createDomainError('resume_integrity_failed', 'A integridade do arquivo não foi confirmada. A importação não foi anunciada.');
      }
      let text = '';
      let extraction = { ok: true, pending: '' };
      try {
        text = await extractDocumentText(absolute);
        if (extension !== '.txt') await writeExtractedText(absolute, text);
      } catch (error) {
        extraction = { ok: false, pending: error.message, code: error.code };
      }
      const variant = memoryService?.saveResumeVariant
        ? await memoryService.saveResumeVariant({ path: relative, label: label || safeName, source: 'importação do usuário', selected: true, sha256: actualSha })
        : { path: relative, sha256: actualSha };
      return {
        imported: true,
        path: relative,
        filename: safeName,
        bytes: stored.length,
        sha256: actualSha,
        text,
        extraction,
        variant
      };
    }
  };
}

function sanitizeName(filename) {
  const base = basename(String(filename ?? '')).replace(/[^\w.\- ()à-úÀ-Ú]+/g, '_');
  if (!base || base.startsWith('.')) throw createDomainError('invalid_resume_filename', 'Informe um nome de arquivo válido.');
  return base;
}

function decodeBase64(value) {
  const raw = String(value ?? '').replace(/^data:[^;]+;base64,/, '');
  if (!raw.trim()) throw createDomainError('resume_content_required', 'Selecione um arquivo. Construir apenas curriculo/nome.pdf não importa o conteúdo.');
  return Buffer.from(raw, 'base64');
}
