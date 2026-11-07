// Shared OpenAI helpers: models, a fetch wrapper, voice matching and speech.

export const STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-transcribe';
// The mini model answers much faster than the full one and handles dialect well.
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

export function hasKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function openai(path, init) {
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`OpenAI ${path} failed`, res.status, detail);
    throw new Error(`OpenAI ${path} failed (${res.status})`);
  }
  return res;
}

// languages: names of languages this person is known to mix (e.g. ['Spanish', 'French']).
export async function transcribe(audio, hintWords = [], languages = []) {
  const stt = new FormData();
  stt.append('file', audio, audio.name || 'clip.m4a');
  stt.append('model', STT_MODEL);
  const words = hintWords.map((n) => String(n).split('=')[0].trim()).filter(Boolean).join(', ');
  const langs = [...new Set(languages.filter(Boolean))];
  const parts = [];
  if (langs.length > 1) {
    parts.push(`Speaker switches between ${langs.join(' and ')} mid-sentence. Write each word in the language it was spoken; do not translate.`);
  }
  if (words) parts.push(words);
  if (parts.length) stt.append('prompt', parts.join(' '));
  const res = await openai('audio/transcriptions', { method: 'POST', body: stt });
  return ((await res.json()).text || '').trim();
}

export async function chatJSON(system, user, maxTokens = 600) {
  const res = await openai('chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) },
      ],
    }),
  });
  const content = (await res.json()).choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// Pick the stock voice closest to the speaker's own pitch (Hz, measured in the browser).
function voiceFromPitch(hz) {
  if (!hz) return null;
  if (hz < 120) return { voice: 'onyx', fallback: 'onyx', desc: 'a deep, low adult male voice' };
  if (hz < 150) return { voice: 'ash', fallback: 'onyx', desc: 'a low-pitched adult male voice' };
  if (hz < 175) return { voice: 'echo', fallback: 'echo', desc: 'a medium-low adult male voice' };
  if (hz < 205) return { voice: 'alloy', fallback: 'alloy', desc: 'a medium-pitched adult voice' };
  if (hz < 235) return { voice: 'sage', fallback: 'nova', desc: 'a medium-high adult female voice' };
  if (hz < 265) return { voice: 'coral', fallback: 'nova', desc: 'a warm, higher adult female voice' };
  return { voice: 'shimmer', fallback: 'shimmer', desc: 'a high, bright adult female voice' };
}

// target = whose language/accent to speak in; speaker = whose voice to sound like.
export function voiceFor(target = {}, speaker = {}, slot = 'bottom') {
  const match = voiceFromPitch(speaker.pitch) || {
    voice: slot === 'top' ? 'coral' : 'sage',
    fallback: slot === 'top' ? 'nova' : 'alloy',
    desc: 'a warm, friendly voice',
  };
  return {
    voice: match.voice,
    fallback: match.fallback,
    instructions: `Speak in natural ${target.name || 'the language of the text'}${
      target.dialect ? ` with the accent and intonation of ${target.dialect}` : ''
    }. Sound like ${match.desc}${speaker.pitch ? ` (around ${Math.round(speaker.pitch)} Hz)` : ''}. Warm and friendly, like a family member. Clear, natural pace.`,
  };
}

// Returns an mp3 Response body (ArrayBuffer), retrying and falling back to an older model.
export async function speakBuffer(text, v) {
  const attempts = [
    { model: TTS_MODEL, voice: v.voice, instructions: v.instructions },
    { model: TTS_MODEL, voice: v.voice, instructions: v.instructions },
    { model: 'tts-1', voice: v.fallback || 'alloy' },
  ];
  for (const a of attempts) {
    try {
      const res = await openai('audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...a, input: String(text).slice(0, 4000), response_format: 'mp3' }),
      });
      return await res.arrayBuffer();
    } catch (e) {
      console.error('TTS attempt failed:', a.model, e.message);
    }
  }
  return null;
}
