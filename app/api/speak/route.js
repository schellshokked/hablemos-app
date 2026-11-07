// Text -> speech, called by the page right after the translated text arrives,
// so the words show on screen while the voice is still being generated.
import { hasKey, speakBuffer } from '../../../lib/openai.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req) {
  if (!hasKey()) return Response.json({ error: 'Server is missing OPENAI_API_KEY' }, { status: 500 });
  try {
    const { text, voice, fallback, instructions } = await req.json();
    if (!text) return Response.json({ error: 'No text' }, { status: 400 });
    const buf = await speakBuffer(text, { voice: voice || 'alloy', fallback, instructions });
    if (!buf) return Response.json({ error: 'Voice unavailable' }, { status: 502 });
    return new Response(buf, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
