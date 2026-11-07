// Every page and API call needs the unlock cookie, except the unlock screen itself.
// If APP_PASSCODE isn't set, the app stays open (handy for local testing).
import { NextResponse } from 'next/server';
import { COOKIE, passcodeEnabled, unlockToken, sameString } from './lib/passcode.js';

export async function middleware(req) {
  if (!passcodeEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname === '/unlock' || pathname === '/api/unlock') return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value || '';
  if (cookie && sameString(cookie, await unlockToken())) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Locked. Reload the app and enter the passcode.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/unlock';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next.js internals and the public icons/manifest so the home-screen icon still works
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon|icon-512.png|manifest.json).*)'],
};
