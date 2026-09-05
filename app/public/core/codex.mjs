// Conta, uso, limites e preferências do Codex. Lido sob demanda (a consulta
// faz quatro chamadas ao app-server) e guardado em store.codex; nunca contém
// token: o serviço local já remove qualquer credencial antes de responder.

import { read, send } from './api.mjs';
import { isDemo, notify, store } from './store.mjs';

let carregando = null;

export async function loadCodex({ refresh = false } = {}) {
  if (isDemo()) return store.codex;
  if (carregando) return carregando;
  carregando = (async () => {
    const dados = refresh
      ? await send('/api/v1/codex/refresh', {}).catch(() => null)
      : await read('/api/v1/codex', { fallback: null });
    store.codex = dados ?? { status: 'unavailable', account: null, usage: null, rateLimits: null, models: [], settings: null };
    notify();
    return store.codex;
  })().finally(() => { carregando = null; });
  return carregando;
}

export async function saveCodexSettings(settings) {
  const salvo = await send('/api/v1/codex/settings', settings, { method: 'PUT' });
  store.codex = { ...(store.codex ?? {}), settings: salvo };
  notify();
  return salvo;
}

export async function logoutCodex() {
  const resultado = await send('/api/v1/auth/openai/logout', {});
  store.codex = { ...(store.codex ?? {}), status: 'unavailable', account: null, usage: null, rateLimits: null };
  notify();
  return resultado;
}

// Limites do ChatGPT vêm em duas janelas; a curta costuma ser de 5 h e a longa,
// semanal. O rótulo é derivado da duração informada, não presumido.
export function describeWindow(limite, padrao) {
  const minutos = Number(limite?.windowDurationMins ?? limite?.windowMinutes ?? 0);
  if (!minutos) return padrao;
  if (minutos % 1440 === 0) { const dias = minutos / 1440; return dias === 7 ? 'semanal' : `${dias} dias`; }
  if (minutos % 60 === 0) return `${minutos / 60} h`;
  return `${minutos} min`;
}

export function resetsAt(limite) {
  const bruto = limite?.resetsAt ?? limite?.resetsAtMs ?? limite?.resets_at;
  if (!bruto) return null;
  const numero = Number(bruto);
  if (Number.isFinite(numero)) return new Date(numero < 1e12 ? numero * 1000 : numero);
  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}
