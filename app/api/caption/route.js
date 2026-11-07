// Mesa mode: one short chunk of table talk -> text + translation for the guest.
import { hasKey, transcribe, chatJSON } from '../../../lib/openai.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SYSTEM = `You write live captions at a family dinner table for one guest who doesn't speak the table's language well. Several relatives talk, sometimes over each other. You get a short transcribed chunk (it may start or end mid-sentence), the guest's language, the table's main language and dialect with notes of regional words, and the last few captions for context.

Return JSON only:
{"skip": false, "lang": "ISO 639-1 of the chunk", "mine": false, "translation": "..."}

- "translation": natural, casual translation into the guest's language. Convey meaning, slang, jokes and tone (e.g. "(teasing)"), not word-for-word. Use the regional notes. Keep names as they are.
- "mine": true if the chunk is already in the guest's language (then translation is "").
- "skip": true if the chunk is noise, a single filler word, or a transcription artifact (e.g. "Thanks for watching", "Subtítulos por…", repeated nonsense).`;

function parse(raw) {
  try {
    return JSON.parse(raw || '{}') || {};
  } catch {
    return {};
  }
}

export async function POST(req) {
  if (!hasKey()) return Response.json({ error: 'Server is missing OPENAI_API_KEY' }, { status: 500 });
  try {
    const form = await req.formData();
    const audio = form.get('audio');
    const me = parse(form.get('me'));
    const table = parse(form.get('table'));
    const context = parse(form.get('context'));
    if (!audio || typeof audio === 'string' || audio.size < 1000) return Response.json({ skip: true });

    const original = await transcribe(audio, table.notes || []);
    if (!original || original.length < 2) return Response.json({ skip: true });

    const out = await chatJSON(
      SYSTEM,
      {
        guest_language: me.dialect || me.name || 'English',
        table_language: table.dialect || table.name || 'auto-detect',
        regional_notes: table.notes || [],
        recent_captions: Array.isArray(context) ? context.slice(-4) : [],
        chunk: original,
      },
      300,
    );
    if (out.skip) return Response.json({ skip: true });
    return Response.json({
      original,
      translation: String(out.translation || '').trim(),
      mine: Boolean(out.mine),
      lang: out.lang || '',
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
