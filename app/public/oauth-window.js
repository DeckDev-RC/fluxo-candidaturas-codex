export function openOAuthWindow(authUrl, { windowRef = globalThis.window } = {}) {
  if (!authUrl || !windowRef) return 'none';
  const popup = windowRef.open('about:blank', '_blank');
  if (popup) {
    popup.opener = null;
    popup.location.replace(authUrl);
    return 'popup';
  }
  windowRef.location.assign(authUrl);
  return 'current';
}
