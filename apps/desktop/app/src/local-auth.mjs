import { assertLocalOrigin } from './trust-boundary.mjs';

// Duas condições, uma regra de origem: o soquete precisa ser de loopback e, se a
// requisição declarar origem, ela passa pela fronteira de confiança do produto.
export function isLocalRequest(request) {
  const address = String(request?.socket?.remoteAddress ?? '');
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  if (!loopback) return false;
  const origin = request?.headers?.origin;
  if (!origin) return true;
  try { assertLocalOrigin(origin); return true; } catch { return false; }
}
