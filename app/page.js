'use client';

import { useEffect, useRef, useState } from 'react';
import { startListener, pickMimeType, silentWavUrl, fetchSpeech } from '../lib/listen.js';

// Starting guesses. Each button re-detects language + dialect on every turn,
// so anyone speaking any language can use either button.
const DEFAULT_PROFILES = {
  top: {
    code: 'es',
    name: 'Spanish',
    dialect: 'Honduran Spanish (Caribbean coast, Tela)',
    confidence: 0.5,
    turns: 0,
    notes: [
      'vos = you (informal, Central American)',
      'cipote / cipota = kid',
      'guirro / guirra = kid',
      'pisto = money',
      'cheque = okay, fine',
      'tuanis = cool, great',
      'maje = dude, guy',
      'pulpería = corner store',
      'baleada = Honduran filled tortilla',
      '¡qué pena! = how embarrassing / sorry',
    ],
    ui: {
      label: 'Español',
      idle: 'Toca para hablar',
      listening: 'Escuchando… toca para terminar',
      busy: 'Traduciendo…',
      empty: 'No te escuché. Intentá otra vez.',
    },
  },
  bottom: {
    code: 'en',
    name: 'English',
    dialect: 'American English',
    confidence: 0.5,
    turns: 0,
    learn: true,
    notes: [],
    ui: {
      label: 'English',
      idle: 'Tap to talk',
      listening: 'Listening… tap to stop',
      busy: 'Translating…',
      empty: "Didn't catch that. Try again.",
    },
  },
};

const AUTO_PROFILE = {
  auto: true,
  turns: 0,
  notes: [],
  ui: {
    label: '🌐',
    idle: 'Tap to talk · Toca para hablar',
    listening: '…',
    busy: '…',
    empty: '?',
  },
};

const EN_UI = DEFAULT_PROFILES.bottom.ui;
const ES_UI = { ...DEFAULT_PROFILES.top.ui, label: 'Español' };
const HN_NOTES = DEFAULT_PROFILES.top.notes;

// label: what the person sees in the list (in their own language). Others get button text from /api/profile.
const PRESETS = [
  { label: 'English (US)', code: 'en', name: 'English', dialect: 'American English', ui: EN_UI },
  { label: 'English (UK)', code: 'en', name: 'English', dialect: 'British English', ui: { ...EN_UI, label: 'English (UK)' } },
  { label: 'Español (Honduras)', code: 'es', name: 'Spanish', dialect: 'Honduran Spanish (Caribbean coast, Tela)', notes: HN_NOTES, ui: { ...ES_UI, label: 'Español (Honduras)' } },
  { label: 'Español (México)', code: 'es', name: 'Spanish', dialect: 'Mexican Spanish', ui: { ...ES_UI, label: 'Español (México)', empty: 'No te escuché. Inténtalo otra vez.' } },
  { label: 'Español (Guatemala)', code: 'es', name: 'Spanish', dialect: 'Guatemalan Spanish', ui: { ...ES_UI, label: 'Español (Guatemala)' } },
  { label: 'Español (El Salvador)', code: 'es', name: 'Spanish', dialect: 'Salvadoran Spanish', ui: { ...ES_UI, label: 'Español (El Salvador)' } },
  { label: 'Español (Puerto Rico)', code: 'es', name: 'Spanish', dialect: 'Puerto Rican Spanish', ui: { ...ES_UI, label: 'Español (Puerto Rico)', empty: 'No te escuché. Inténtalo otra vez.' } },
  { label: 'Español (España)', code: 'es', name: 'Spanish', dialect: 'Peninsular Spanish (Spain)', ui: { ...ES_UI, label: 'Español (España)', empty: 'No te he oído. Inténtalo otra vez.' } },
  { label: 'Português (Brasil)', code: 'pt', name: 'Portuguese', dialect: 'Brazilian Portuguese' },
  { label: 'Français', code: 'fr', name: 'French', dialect: 'French' },
  { label: 'Kreyòl ayisyen', code: 'ht', name: 'Haitian Creole', dialect: 'Haitian Creole' },
  { label: '中文 (普通话)', code: 'zh', name: 'Chinese', dialect: 'Mandarin Chinese' },
  { label: '粵語', code: 'zh', name: 'Chinese', dialect: 'Cantonese (Hong Kong)' },
  { label: 'Tiếng Việt', code: 'vi', name: 'Vietnamese', dialect: 'Vietnamese' },
  { label: 'Tagalog', code: 'tl', name: 'Tagalog', dialect: 'Filipino / Tagalog' },
  { label: 'العربية', code: 'ar', name: 'Arabic', dialect: 'Arabic' },
  { label: '한국어', code: 'ko', name: 'Korean', dialect: 'Korean' },
  { label: 'Русский', code: 'ru', name: 'Russian', dialect: 'Russian' },
  { label: 'Українська', code: 'uk', name: 'Ukrainian', dialect: 'Ukrainian' },
  { label: 'हिन्दी', code: 'hi', name: 'Hindi', dialect: 'Hindi' },
  { label: 'Deutsch', code: 'de', name: 'German', dialect: 'German' },
  { label: 'Italiano', code: 'it', name: 'Italian', dialect: 'Italian' },
  { label: '日本語', code: 'ja', name: 'Japanese', dialect: 'Japanese' },
  { label: 'Polski', code: 'pl', name: 'Polish', dialect: 'Polish' },
];

const STORAGE_KEY = 'hablemos.profiles.v1';
const COLORS = { top: 'talk-top', bottom: 'talk-bottom' };

function loadProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.top && saved?.bottom) return saved;
  } catch {}
  return DEFAULT_PROFILES;
}

function saveProfiles(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

export default function Home() {
  const [profiles, setProfiles] = useState(DEFAULT_PROFILES);
  const [recording, setRecording] = useState(null); // 'top' | 'bottom' | null
  const [busy, setBusy] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null); // { slot, text }
  const [showDetails, setShowDetails] = useState(false);
  const [picker, setPicker] = useState(null); // slot whose language list is open
  const [otherText, setOtherText] = useState('');
  const [pickerBusy, setPickerBusy] = useState(false);

  const profilesRef = useRef(DEFAULT_PROFILES);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const silentRef = useRef(null);
  const audioCtxRef = useRef(null);
  const pitchStopRef = useRef(null);
  const btnRefs = useRef({}); // talk buttons, for the live voice rings

  useEffect(() => {
    const p = loadProfiles();
    profilesRef.current = p;
    setProfiles(p);
  }, []);

  function updateProfile(slot, profile) {
    const next = { ...profilesRef.current, [slot]: profile };
    profilesRef.current = next;
    setProfiles(next);
    saveProfiles(next);
  }

  function resetProfiles() {
    profilesRef.current = DEFAULT_PROFILES;
    setProfiles(DEFAULT_PROFILES);
    saveProfiles(DEFAULT_PROFILES);
  }

  async function chooseLanguage(slot, preset) {
    setError(null);
    const keepLearn = Boolean(profilesRef.current[slot]?.learn);
    if (preset === 'auto') {
      updateProfile(slot, { ...AUTO_PROFILE, learn: keepLearn });
      setPicker(null);
      return;
    }
    const base = {
      code: preset.code,
      name: preset.name,
      dialect: preset.dialect,
      confidence: 0.9,
      locked: true,
      auto: false,
      turns: 0,
      notes: preset.notes || [],
      learn: keepLearn,
      ui: preset.ui || { ...EN_UI, label: preset.label },
    };
    updateProfile(slot, base);
    setPicker(null);
    if (!preset.ui) {
      // Fetch button text in the chosen language
      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: preset.dialect || preset.label }),
        });
        const data = await res.json();
        if (res.ok && data.ui) updateProfile(slot, { ...base, ui: { ...data.ui, label: preset.label } });
      } catch {}
    }
  }

  async function chooseOther(slot) {
    const text = otherText.trim();
    if (!text) return;
    setPickerBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      await chooseLanguage(slot, { label: data.ui?.label || text, code: data.code, name: data.name, dialect: data.dialect, ui: data.ui });
      setOtherText('');
    } catch {
      alert('Unknown language');
    } finally {
      setPickerBusy(false);
    }
  }

  function unlockAudio() {
    if (!audioRef.current) audioRef.current = new Audio();
    if (!silentRef.current) silentRef.current = silentWavUrl();
    const a = audioRef.current;
    a.src = silentRef.current;
    a.play().catch(() => {});
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

  function toggleLearn(slot) {
    const p = profilesRef.current[slot];
    updateProfile(slot, { ...p, learn: !p.learn });
  }

  async function toggle(slot) {
    setError(null);
    if (busy) return;

    if (recording === slot) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      return;
    }
    if (recording) return;

    unlockAudio(); // must happen synchronously inside the tap
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current && Ctx) audioCtxRef.current = new Ctx();
      audioCtxRef.current?.resume?.();
    } catch {}

    try {
      const live = streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live');
      if (!live) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
    } catch {
      setError({ slot, text: 'Microphone permission is needed. / Se necesita el micrófono.' });
      return;
    }

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || 'audio/mp4';
      const { pitch } = pitchStopRef.current ? pitchStopRef.current.stop() : { pitch: null };
      pitchStopRef.current = null;
      // Release the mic between turns (on iPhone an open mic makes playback quiet)
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      send(slot, new Blob(chunksRef.current, { type }), pitch);
    };
    rec.start();
    // Stops by itself ~0.9s after the person finishes talking (tapping still works too)
    if (audioCtxRef.current) {
      pitchStopRef.current = startListener(audioCtxRef.current, streamRef.current, {
        onSilence: () => rec.state === 'recording' && rec.stop(),
        onLevel: (lvl) => btnRefs.current[slot]?.style.setProperty('--level', lvl.toFixed(2)),
      });
    }
    recorderRef.current = rec;
    setRecording(slot);
  }

  async function send(slot, blob, pitch) {
    setRecording(null);
    const speaker = profilesRef.current[slot];
    const listener = profilesRef.current[slot === 'top' ? 'bottom' : 'top'];

    if (blob.size < 500) {
      setError({ slot, text: speaker.ui?.empty || "Didn't catch that." });
      return;
    }
    setBusy(slot);
    try {
      const ext = blob.type.includes('webm') ? 'webm' : 'm4a';
      const fd = new FormData();
      fd.append('audio', blob, `clip.${ext}`);
      fd.append('slot', slot);
      fd.append('speaker', JSON.stringify(speaker));
      fd.append('listener', JSON.stringify(listener));
      if (pitch) fd.append('pitch', String(Math.round(pitch)));
      const res = await fetch('/api/translate', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (data.error === 'empty') throw new Error(speaker.ui?.empty || "Didn't catch that.");
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      if (data.speaker && !data.wrongButton) updateProfile(slot, data.speaker);
      const id = Date.now();
      setHistory((h) => [{ id, ...data, audio: null }, ...h].slice(0, 40));
      setBusy(null); // text is on screen now; voice follows
      if (data.speech) {
        const url = await fetchSpeech(data.speech);
        if (url) {
          setHistory((h) => h.map((m) => (m.id === id ? { ...m, audio: url } : m)));
          play(url);
        } else {
          setError({ slot, text: 'Voice unavailable, read the text / Sin voz, lea el texto' });
        }
      }
    } catch (e) {
      setError({ slot, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  function renderPerson(slot) {
    const p = profiles[slot];
    const ui = p.ui || {};
    const active = recording === slot;
    const working = busy === slot;
    const disabled = Boolean(busy) || Boolean(recording && !active);
    const status = active ? ui.listening : working ? ui.busy : ui.idle;
    const label = p.auto ? '🌐' : ui.label || p.name;
    const state = active ? 'listening' : working ? 'working' : 'idle';
    return (
      <section key={slot} className={`person person-${slot} ${slot === 'top' ? 'flipped' : ''} is-${state}`}>
        <button
          ref={(el) => (btnRefs.current[slot] = el)}
          className="talk"
          onClick={() => toggle(slot)}
          disabled={disabled}
          aria-pressed={active}
        >
          <span className="orb" aria-hidden="true">
            <span className="ring ring-2" />
            <span className="ring ring-1" />
            <span className="orb-core" />
          </span>
          <span className="talk-lang">{label}</span>
          <span className="talk-status">{status}</span>
          {error?.slot === slot && <span className="talk-error" role="alert">{error.text}</span>}
        </button>
        <div className="person-bar">
          <button className="chip" onClick={() => setPicker(slot)} disabled={Boolean(recording || busy)}>
            🌐 {p.auto ? 'Auto' : ui.label || p.name}
          </button>
          <button
            className={`chip chip-learn ${p.learn ? 'on' : ''}`}
            onClick={() => toggleLearn(slot)}
            disabled={Boolean(recording || busy)}
            aria-pressed={Boolean(p.learn)}
          >
            🎓 {p.learn ? 'Learning' : 'Learn'}
          </button>
        </div>
      </section>
    );
  }

  function renderPicker() {
    if (!picker) return null;
    const current = profiles[picker];
    return (
      <div className="overlay" onClick={() => setPicker(null)}>
        <div className={`sheet ${picker === 'top' ? 'flipped' : ''}`} onClick={(e) => e.stopPropagation()}>
          <button className={`option ${current.auto ? 'selected' : ''}`} onClick={() => chooseLanguage(picker, 'auto')}>
            🌐 Any language (auto-detect)
          </button>
          {PRESETS.map((pr) => (
            <button
              key={pr.label}
              className={`option ${!current.auto && current.dialect === pr.dialect ? 'selected' : ''}`}
              onClick={() => chooseLanguage(picker, pr)}
            >
              {pr.label}
            </button>
          ))}
          <div className="other">
            <input
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Other… (e.g. Garifuna, Somali)"
              onKeyDown={(e) => e.key === 'Enter' && chooseOther(picker)}
            />
            <button onClick={() => chooseOther(picker)} disabled={pickerBusy}>
              {pickerBusy ? '…' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // What each person sees on their half: their own words if they spoke, the translation if the other person did.
  function renderHalf(slot) {
    const flipped = slot === 'top';
    const m = history[0];
    let main = null;
    let sub = null;
    if (m) {
      const spoke = m.slot === slot;
      if (m.needsListener) {
        main = m.original;
        sub = spoke ? '' : '🌐 Tap your button and speak so I can learn your language';
      } else {
        main = spoke && !m.wrongButton ? m.original : m.translated;
        sub = spoke && !m.wrongButton ? m.translated : m.practice ? '' : m.original;
      }
    }
    if (m && m.slot === slot && m.coach) {
      const c = m.coach;
      return (
        <div className={`half coach ${flipped ? 'flipped' : ''}`}>
          {c.correction && (
            <p className="correction">
              ✏️ <s>{m.original}</s>
              <br />
              {c.correction.why}
            </p>
          )}
          <p className="coach-label">{c.correction ? 'Better way to say it' : 'Say it yourself'}</p>
          <p className="translated">{c.correction?.better || m.translated}</p>
          {c.pronunciation && <p className="pron">{c.pronunciation}</p>}
          {c.tip && <p className="tip">💡 {c.tip}</p>}
          {!c.correction && <p className="said">{m.original}</p>}
          {m.audio && (
            <div className="coach-buttons">
              <button className="replay inline" onClick={() => play(m.audio)} aria-label="Play">▶</button>
              <button className="replay inline" onClick={() => play(m.audio, 0.7)} aria-label="Play slowly">🐢</button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className={`half ${flipped ? 'flipped' : ''}`}>
        {m ? (
          <>
            {m.wrongButton && <p className="warn">Wrong button? · ¿Botón equivocado?</p>}
            {m.mix?.length > 1 && <p className="mix-tag">{m.mix.map((c) => c.toUpperCase()).join(' + ')}</p>}
            <p className="translated">{main}</p>
            <p className="said">{sub}</p>
            {m.audio && (
              <button className="replay" onClick={() => play(m.audio)} aria-label="Play again">
                ▶
              </button>
            )}
          </>
        ) : (
          <p className="hint">
            {profiles[slot].code === 'es'
              ? 'Tocá tu botón y hablá. Se detiene solo cuando terminás.'
              : 'Tap your button and talk. It stops when you pause.'}
          </p>
        )}
      </div>
    );
  }

  function describe(p) {
    if (p.auto) return 'Auto-detect · waiting for first words';
    const also = p.also_speaks?.length ? ` · also ${p.also_speaks.join(', ')}` : '';
    return `${p.dialect || p.name}${p.locked ? ' (chosen)' : ''}${also}${p.pitch ? ` · voice ~${Math.round(p.pitch)} Hz` : ''} · ${Math.round((p.confidence || 0) * 100)}% · ${p.turns || 0} turns`;
  }

  return (
    <main className="app">
      <div className="stage">
        {renderPerson('top')}
        <section className="strip" aria-live="polite">
          {renderHalf('top')}
          {renderHalf('bottom')}
        </section>
        {renderPerson('bottom')}
      </div>
      {renderPicker()}

      <section className="dialects">
        <a className="mesa-link" href="/mesa">🍽 Mesa mode: follow a whole table</a>
        <button className="link" onClick={() => setShowDetails((s) => !s)}>
          {showDetails ? 'Hide' : 'Show'} what it has learned
        </button>
        {showDetails && (
          <div className="dialect-details">
            {['top', 'bottom'].map((slot) => (
              <div key={slot} className={`dialect-card dialect-${slot}`}>
                <p className="dialect-name">{describe(profiles[slot])}</p>
                {profiles[slot].notes?.length > 0 && (
                  <ul>
                    {profiles[slot].notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <button className="link danger" onClick={resetProfiles}>
              Reset to default languages
            </button>
          </div>
        )}
      </section>

      {history.length > 1 && (
        <section className="history">
          {history.slice(1).map((m) => (
            <div key={m.id} className={`bubble bubble-${m.slot}`} onClick={() => m.audio && play(m.audio)}>
              <p className="said">{m.original}</p>
              <p className="translated">{m.translated}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
