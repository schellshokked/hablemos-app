// Passcode lock helpers. The cookie holds a signature of the passcode, never the passcode itself,
// so changing APP_PASSCODE in Vercel logs every phone out.

export const COOKIE = 'hablemos_unlock';
export const ONE_YEAR = 60 * 60 * 24 * 365;

export function passcodeEnabled() {
  return Boolean(process.env.APP_PASSCODE);
}

export async function unlockToken(passcode = process.env.APP_PASSCODE || '') {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('hablemos-unlock-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compare without leaking timing information
export function sameString(a = '', b = '') {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
