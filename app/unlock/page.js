'use client';

import { useState } from 'react';

export default function Unlock() {
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle'); // idle | checking | wrong

  async function submit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setState('checking');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error();
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.replace(next.startsWith('/') ? next : '/');
    } catch {
      setState('wrong');
      setCode('');
    }
  }

  return (
    <main className="unlock">
      <form className="unlock-card" onSubmit={submit}>
        <h1 className="unlock-title">Hablemos</h1>
        <label className="unlock-label" htmlFor="code">
          Código de la familia
          <span>Family passcode</span>
        </label>
        <input
          id="code"
          className="unlock-input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (state === 'wrong') setState('idle');
          }}
        />
        {state === 'wrong' && (
          <p className="unlock-wrong" role="alert">
            Ese código no es. Probá otra vez.
            <span>That code didn&apos;t match. Try again.</span>
          </p>
        )}
        <button className="unlock-button" type="submit" disabled={state === 'checking' || !code.trim()}>
          {state === 'checking' ? '…' : 'Entrar · Unlock'}
        </button>
      </form>
    </main>
  );
}
