// Mesa mode helpers: "What are they talking about?" and "Help me jump in".
import { hasKey, chatJSON, voiceFor } from '../../../lib/openai.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUMMARY = `You help a guest follow a family dinner conversation in a language they don't speak well. From the recent captions (original + translation, oldest first), write a short, friendly catch-up IN THE GUEST'S LANGUAGE: 1-3 sentences on what people are talking about right now, including who if it's clear (names, "your mother-in-law"), the mood, and any joke or story being told. Focus on the last few minutes.
Return JSON only: {"summary": "..."}`;

const SUGGEST = `You help a guest join a family dinner conversation in the table's language and dialect. Based on the recent captions, suggest ONE short, natural, warm thing the guest could say right now to join in: a reaction, a question about the story, a compliment to the cook, or a kind toast. Make it simple enough for a learner to say, in the table's exact dialect (e.g. voseo for Honduran Spanish).
Return JSON only:
{"phrase": "what to say, in the table's language", "pronunciation": "respelled for a speaker of the guest's language, stressed syllables in CAPS", "meaning": "what it means, in the guest's language", "tip": "one short tip in the guest's language on when/how to say it (max 20 words)"}`;

export async function POST(req) {
  if (!hasKey()) return Response.json({ error: 'Server is missing OPENAI_API_KEY' }, { status: 500 });
  try {
    const { mode, captions = [], me = {}, table = {} } = await req.json();
    const input = {
      guest_language: me.dialect || me.name || 'English',
      table_language: table.dialect || table.name || 'Spanish',
      regional_notes: table.notes || [],
      recent_captions: captions.slice(-40).map((c) => ({ original: c.original, translation: c.translation })),
    };
    if (!captions.length) {
      return Response.json({ error: 'Nothing heard yet' }, { status: 400 });
    }
    if (mode === 'suggest') {
      const out = await chatJSON(SUGGEST, input, 300);
      // Spoken in the table's dialect, in a voice close to the guest's own
      const speech = out.phrase ? { text: out.phrase, ...voiceFor(table, me, 'bottom') } : null;
      return Response.json({ ...out, speech });
    }
    const out = await chatJSON(SUMMARY, input, 250);
    return Response.json({ summary: out.summary || '' });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
