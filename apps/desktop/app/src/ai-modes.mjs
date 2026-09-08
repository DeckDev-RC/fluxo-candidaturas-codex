import { createDomainError } from './domain/errors.mjs';

export const SUPPORTED_AI_MODES = ['codex-app-server', 'skynet-hybrid', 'skynet-chat-only', 'offline-read'];

export function resolveAiMode({ requested = '', runtime } = {}) {
  const mode = String(requested || runtime?.mode || 'codex-app-server');
  if (!SUPPORTED_AI_MODES.includes(mode)) {
    throw createDomainError('ai_mode_unsupported', `Modo de IA não anunciado: ${mode}.`);
  }
  if (mode === 'codex-app-server' && runtime?.available !== true) {
    throw createDomainError('ai_mode_unavailable', 'O runtime Codex App Server não está disponível. Nenhum fixture, provedor alternativo ou orçamento extra foi ativado.');
  }
  if (['skynet-hybrid', 'skynet-chat-only'].includes(mode) && runtime?.available !== true) {
    throw createDomainError('ai_mode_unavailable', 'A conversa do SkynetChat não está autenticada.');
  }
  const provider = { 'offline-read': 'local-read', 'skynet-hybrid': 'skynet-chat', 'skynet-chat-only': 'skynet-chat', 'codex-app-server': 'codex-app-server' }[mode];
  return { mode, provider, fallback: false };
}

export function assertNoSilentFallback({ from, to } = {}) {
  if (from && to && from !== to) {
    throw createDomainError('ai_mode_silent_switch', 'Troca silenciosa de provedor ou modo de IA não é permitida.');
  }
}
