export function isLocalRequest(request) {
  const address = String(request?.socket?.remoteAddress ?? '');
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  if (!loopback) return false;
  const origin = request?.headers?.origin;
  if (!origin) return true;
  try { const url = new URL(origin); return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'); } catch { return false; }
}
