// Browser-side listening helpers: voice pitch and "they stopped talking" detection.

// Estimate voice pitch (Hz) from a short audio frame using autocorrelation.
export function detectPitch(buf, sampleRate) {
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / buf.length) < 0.01) return null; // silence
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(Math.floor(sampleRate / 70), buf.length - 1);
  const corr = new Float32Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < buf.length - lag; i++) c += buf[i] * buf[i + lag];
    corr[lag] = c;
    if (c > best) best = c;
  }
  if (best / energy < 0.45) return null; // not clearly voiced
  // First strong peak avoids octave mistakes
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= 0.9 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      return sampleRate / lag;
    }
  }
  return null;
}

// Watches a mic stream. Calls onSilence() once the person has spoken and then paused
// for silenceMs (or after maxMs). stop() returns { pitch, hadSpeech }.
export function startListener(ctx, stream, { onSilence, onLevel, silenceMs = 900, maxMs = 30000, trackPitch = true } = {}) {
  let src;
  let id;
  const pitches = [];
  let hadSpeech = false;
  let speechFrames = 0;
  let quietSince = 0;
  let floor = null;
  let fired = false;
  const started = Date.now();
  const fire = () => {
    if (!fired && onSilence) {
      fired = true;
      onSilence();
    }
  };
  try {
    src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    id = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let e = 0;
      for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      const rms = Math.sqrt(e / buf.length);
      // Background noise level adapts slowly upward, quickly downward
      floor = floor === null ? rms : Math.min(rms, floor * 1.01 + 0.0002);
      const speakThreshold = Math.max(0.015, floor * 3);
      const quietThreshold = Math.max(0.01, floor * 2);
      const now = Date.now();
      if (onLevel) onLevel(Math.min(1, Math.max(0, (rms - floor) / 0.12)));

      if (rms > speakThreshold) {
        speechFrames++;
        if (speechFrames >= 2) hadSpeech = true;
        quietSince = 0;
      } else if (rms < quietThreshold) {
        speechFrames = 0;
        if (!quietSince) quietSince = now;
        if (hadSpeech && now - quietSince >= silenceMs) fire();
      }
      if (now - started >= maxMs) fire();

      if (trackPitch && rms > speakThreshold) {
        const hz = detectPitch(buf, ctx.sampleRate);
        if (hz) pitches.push(hz);
      }
    }, 60);
  } catch {
    // No analyser available: fall back to manual stop only
  }
  return {
    get hadSpeech() {
      return hadSpeech;
    },
    stop() {
      clearInterval(id);
      if (onLevel) onLevel(0);
      try {
        src?.disconnect();
      } catch {}
      let pitch = null;
      if (pitches.length >= 5) {
        pitches.sort((a, b) => a - b);
        pitch = pitches[Math.floor(pitches.length / 2)];
      }
      return { pitch, hadSpeech };
    },
  };
}

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

// A tiny silent WAV, played inside a tap so iOS Safari lets the page play audio later.
export function silentWavUrl() {
  const rate = 8000;
  const n = 400;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// Fetch spoken audio for a translation; returns an object URL or null.
export async function fetchSpeech(speech) {
  if (!speech?.text) return null;
  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(speech),
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}
