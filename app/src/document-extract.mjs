import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createDomainError } from './domain/errors.mjs';

const MIN_TEXT = 20;

export async function extractDocumentText(absolutePath) {
  const extension = extname(absolutePath).toLowerCase();
  if (extension === '.txt') {
    const text = String(await readFile(absolutePath, 'utf8')).trim();
    return finish(text, 'txt');
  }
  if (extension === '.docx') return finish(extractDocx(await readFile(absolutePath)), 'docx');
  if (extension === '.pdf') return finish(extractPdf(await readFile(absolutePath)), 'pdf');
  throw createDomainError('unsupported_resume_format', 'Formato aceito: PDF, DOCX ou TXT.');
}

export async function writeExtractedText(absolutePath, text) {
  const output = absolutePath.replace(/\.(pdf|docx)$/i, '.txt');
  await writeFile(output, text, 'utf8');
  return output;
}

function finish(text, format) {
  const value = String(text ?? '').replace(/\u0000/g, '').trim();
  if (value.length < MIN_TEXT) {
    const code = format === 'pdf' ? 'pdf_without_text' : 'resume_corrupt_or_empty';
    throw createDomainError(code, format === 'pdf'
      ? 'O PDF não contém texto pesquisável. OCR não é suportado nesta versão. Preserve o original e envie DOCX ou TXT.'
      : 'O arquivo está corrompido ou não produziu texto suficiente. O original foi preservado.');
  }
  return value;
}

function extractDocx(buffer) {
  const xml = readZipEntry(buffer, 'word/document.xml');
  if (!xml) throw createDomainError('resume_corrupt_or_empty', 'DOCX sem word/document.xml. O original foi preservado.');
  const texts = [...String(xml).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => decodeXml(match[1]));
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

function extractPdf(buffer) {
  const raw = buffer.toString('latin1');
  const chunks = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const payload = Buffer.from(match[1], 'latin1');
    try { chunks.push(inflateRawSync(payload).toString('utf8')); } catch {
      chunks.push(payload.toString('utf8'));
    }
  }
  const text = [...`${raw}\n${chunks.join('\n')}`.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)]
    .map((match) => match[0].slice(1, -1).replace(/\\n/g, '\n').replace(/\\(.)/g, '$1'))
    .filter((item) => /[A-Za-zÀ-ÿ]{3,}/.test(item))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function readZipEntry(buffer, name) {
  const target = Buffer.from(name);
  let offset = 0;
  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) { offset += 1; continue; }
    const nameSize = buffer.readUInt16LE(offset + 26);
    const extraSize = buffer.readUInt16LE(offset + 28);
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 18);
    const fileName = buffer.subarray(offset + 30, offset + 30 + nameSize);
    const start = offset + 30 + nameSize + extraSize;
    if (fileName.equals(target)) {
      const bytes = buffer.subarray(start, start + compressed);
      return method === 8 ? inflateRawSync(bytes).toString('utf8') : bytes.toString('utf8');
    }
    offset = start + compressed;
  }
  return '';
}

function decodeXml(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
