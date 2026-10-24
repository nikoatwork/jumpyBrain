import { isAppNavigation } from './host.mjs';

/** Deliver data to the owned shell; never expose native actions or arbitrary code. */
export async function publishSystemMessage(window, origin, message) {
  const contents = window && !window.isDestroyed() ? window.webContents : null;
  if (!contents || contents.isDestroyed() || !origin || !isAppNavigation(contents.getURL(), origin)) return false;
  if (typeof message.source !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(message.source) || typeof message.text !== 'string') return false;
  const data = { source: message.source, text: message.text.slice(0, 4096), severity: message.severity ?? 'error', scope: 'app' };
  const serialized = JSON.stringify(data).replaceAll('<', '\\u003c');
  try {
    return await contents.executeJavaScript(`(() => {
      if (!document.getElementById('app-toast')) return false;
      document.dispatchEvent(new CustomEvent('jumpybrain-system-message', { detail: ${serialized} }));
      return true;
    })()`) === true;
  } catch { return false; }
}

/** Startup/onboarding/crashed renderers still need a native fallback. */
export function createSystemMessages({ getWindow, getOrigin, fallback }) {
  return async ({ source, text, severity = 'error', title = 'jumpyBrain' }) => {
    if (await publishSystemMessage(getWindow(), getOrigin(), { source, text, severity })) return;
    return fallback({ type: severity === 'warning' ? 'warning' : severity === 'error' ? 'error' : 'info', title, message: text });
  };
}
