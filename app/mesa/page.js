'use client';

// Mesa mode: the phone listens to the whole table and shows live captions in your language.
import { useEffect, useRef, useState } from 'react';
import { startListener, pickMimeType, silentWavUrl, fetchSpeech } from '../../lib/listen.js';

const STORAGE_KEY = 'hablemos.profiles.v1';
const FALLBACK = {
  me: { code: 'en', name: 'English', dialect: 'American English', notes: [] },
  table: { code: 'es', name: 'Spanish', dialect: 'Honduran Spanish (Caribbean coast, Tela)', notes: [] },
};

function loadLanguages() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (p?.bottom && p?.top) {
      return {
        me: p.bottom.auto ? FALLBACK.me : p.bottom,
        table: p.top.auto ? { name: 'auto-detect', notes: [] } : p.top,
      };
    }
  } catch {}
  return FALLBACK;
}

export default function Mesa() {
  const [langs, setLangs] = useState(FALLBACK);
  const [listening, setListening] = useState(false);
  const [captions, setCaptions] = useState([]); // {seq, original, translation, mine, pending}
  const [summary, setSummary] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [helperBusy, setHelperBusy] = useState(null); // 'summary' | 'suggest'
  const [error, setError] = useState('');

  const listeningRef = useRef(false);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const recRef = useRef(null);
  const seqRef = useRef(0);
  const captionsRef = useRef([]);
  const audioRef = useRef(null);
  const wakeRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    setLangs(loadLanguages());
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest caption in view
  useEffect(() => {
    captionsRef.current = captions;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [captions]);

  function unlockAudio() {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = silentWavUrl();
    audioRef.current.play().catch(() => {});
  }

  function play(url, rate = 1) {
    if (!url) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.src = url;
    a.playbackRate = rate;
    a.preservesPitch = true;
    a.play().catch(() => {});
  }

  async function start() {
    setError('');
    unlockAudio();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
      ctxRef.current?.resume?.();
    } catch {}
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError('Microphone permission is needed.');
      return;
    }
    try {
      wakeRef.current = await navigator.wakeLock?.request('screen'); // keep the screen on
    } catch {}
    listeningRef.current = true;
    setListening(true);
    recordChunk();
  }

  function stop() {
    listeningRef.current = false;
    setListening(false);
    if (recRef.current?.state === 'recording') recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      wakeRef.current?.release();
    } catch {}
  }

  // Records until a pause in the talk (or ~9s), sends that chunk, and starts the next one.
  function recordChunk() {
    const stream = streamRef.current;
    if (!listeningRef.current || !stream) return;
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const listener = ctxRef.current
      ? startListener(ctxRef.current, stream, {
          onSilence: () => rec.state === 'recording' && rec.stop(),
          silenceMs: 700,
          maxMs: 9000,
          trackPitch: false,
        })
      : null;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const { hadSpeech } = listener ? listener.stop() : { hadSpeech: true };
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/mp4' });
      recordChunk(); // keep listening right away
      if (hadSpeech && blob.size > 2000) sendChunk(blob);
    };
    rec.start();
    recRef.current = rec;
    // Without the analyser, cut every 6s
    if (!listener) setTimeout(() => rec.state === 'recording' && rec.stop(), 6000);
  }

  async function sendChunk(blob) {
    const seq = ++seqRef.current;
    setCaptions((c) => [...c, { seq, pending: true }].slice(-200));
    try {
      const context = captionsRef.current
        .filter((c) => !c.pending && c.original)
        .slice(-4)
        .map((c) => ({ original: c.original, translation: c.translation }));
      const fd = new FormData();
      fd.append('audio', blob, `chunk.${blob.type.includes('webm') ? 'webm' : 'm4a'}`);
      fd.append('me', JSON.stringify(langs.me));
      fd.append('table', JSON.stringify(langs.table));
      fd.append('context', JSON.stringify(context));
      const res = await fetch('/api/caption', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.skip || !data.original) {
        setCaptions((c) => c.filter((x) => x.seq !== seq));
        if (!res.ok && data.error) setError(data.error);
        return;
      }
      setCaptions((c) =>
        c.map((x) => (x.seq === seq ? { seq, original: data.original, translation: data.translation, mine: data.mine } : x)),
      );
    } catch {
      setCaptions((c) => c.filter((x) => x.seq !== seq));
    }
  }

  async function helper(mode) {
    setError('');
    const done = captionsRef.current.filter((c) => !c.pending && c.original);
    if (!done.length) {
      setError("I haven't heard anything yet.");
      return;
    }
    unlockAudio();
    setHelperBusy(mode);
    try {
      const res = await fetch('/api/mesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, captions: done, me: langs.me, table: langs.table }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      if (mode === 'summary') {
        setSummary(data.summary);
      } else {
        setSuggestion({ ...data, audio: null });
        const url = await fetchSpeech(data.speech);
        if (url) setSuggestion((s) => (s ? { ...s, audio: url } : s));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setHelperBusy(null);
    }
  }

  return (
    <main className="mesa">
      <header className="mesa-top">
        <a href="/" className="mesa-back">
          ← Hablemos
        </a>
        <span className="mesa-langs">
          {langs.table.dialect || langs.table.name} → {langs.me.name || 'English'}
        </span>
      </header>

      <button className={`mesa-listen ${listening ? 'on' : ''}`} onClick={listening ? stop : start}>
        {listening ? '● Listening to the table, tap to stop' : '🍽 Start listening'}
      </button>
      {listening && <p className="mesa-note">Let the table know your phone is translating for you.</p>}
      {error && <p className="mesa-error">{error}</p>}

      <section className="mesa-captions" ref={listRef}>
        {captions.length === 0 && (
          <p className="hint">Put the phone near the middle of the table. Captions appear here as people talk.</p>
        )}
        {captions.map((c) =>
          c.pending ? (
            <div key={c.seq} className="cap pending">…</div>
          ) : (
            <div key={c.seq} className={`cap ${c.mine ? 'mine' : ''}`}>
              {!c.mine && <p className="cap-tr">{c.translation}</p>}
              <p className="cap-orig">{c.original}</p>
            </div>
          ),
        )}
      </section>

      {summary && (
        <div className="mesa-card">
          <button className="mesa-close" onClick={() => setSummary(null)}>
            ×
          </button>
          <p className="mesa-card-label">🤔 What&apos;s going on</p>
          <p>{summary}</p>
        </div>
      )}

      {suggestion && (
        <div className="mesa-card">
          <button className="mesa-close" onClick={() => setSuggestion(null)}>
            ×
          </button>
          <p className="mesa-card-label">🙋 Try saying</p>
          <p className="mesa-phrase">{suggestion.phrase}</p>
          {suggestion.pronunciation && <p className="pron">{suggestion.pronunciation}</p>}
          {suggestion.meaning && <p className="cap-orig">“{suggestion.meaning}”</p>}
          {suggestion.tip && <p className="tip">💡 {suggestion.tip}</p>}
          <div className="coach-buttons">
            <button className="replay inline" disabled={!suggestion.audio} onClick={() => play(suggestion.audio)}>
              ▶
            </button>
            <button className="replay inline" disabled={!suggestion.audio} onClick={() => play(suggestion.audio, 0.7)}>
              🐢
            </button>
          </div>
        </div>
      )}

      <div className="mesa-actions">
        <button onClick={() => helper('summary')} disabled={Boolean(helperBusy)}>
          {helperBusy === 'summary' ? '…' : "🤔 What's going on?"}
        </button>
        <button onClick={() => helper('suggest')} disabled={Boolean(helperBusy)}>
          {helperBusy === 'suggest' ? '…' : '🙋 Help me jump in'}
        </button>
      </div>
    </main>
  );
}
