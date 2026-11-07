import { COOKIE, ONE_YEAR, passcodeEnabled, unlockToken, sameString } from '../../../lib/passcode.js';

export const runtime = 'nodejs';

export async function POST(req) {
  if (!passcodeEnabled()) return Response.json({ ok: true });
  let code = '';
  try {
    code = String((await req.json()).code || '').trim();
  } catch {}

  const ok = code && sameString(await unlockToken(code), await unlockToken());
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down guessing
    return Response.json({ ok: false }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    `${COOKIE}=${await unlockToken()}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`,
  );
  return res;
}
