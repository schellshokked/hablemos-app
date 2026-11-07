// Builds a language profile (with button text in that language) for any language a person picks.
export const runtime = 'nodejs';
export const maxDuration = 30;

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1';

export async function POST(req) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'Server is missing OPENAI_API_KEY' }, { status: 500 });
  }
  try {
    const { language } = await req.json();
    if (!language || String(language).length > 80) {
      return Response.json({ error: 'Missing language' }, { status: 400 });
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TEXT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `A person picked their language for a two-way voice interpreter app. Return JSON only:
{"code": "ISO 639-1 (or 639-3 if none)", "name": "English name of the language", "dialect": "specific regional variety, e.g. 'Brazilian Portuguese (São Paulo)'; generic if no region given", "ui": {"label": "language name written in that language, plus region in parentheses if given", "idle": "Tap to talk", "listening": "Listening… tap to stop", "busy": "Translating…", "empty": "Didn't catch that. Try again."}}
All ui strings must be translated into the picked language and dialect, short and natural. If the input is not a real language, return {"error": "unknown"}.`,
          },
          { role: 'user', content: String(language) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI failed (${res.status})`);
    const out = JSON.parse((await res.json()).choices?.[0]?.message?.content || '{}');
    if (out.error) return Response.json({ error: 'unknown' }, { status: 422 });
    return Response.json(out);
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
