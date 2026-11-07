// speech -> text -> (detect language + dialect, translate). Returns the text right away;
// the page then asks /api/speak for the voice, so words appear before the audio is ready.
import { hasKey, transcribe, chatJSON, voiceFor } from '../../../lib/openai.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You are the live interpreter for a family talking face to face. Conversations are mostly about everyday family life and caring for a three-year-old: food, naps, bathroom, health, daycare, pickups, schedules. Affectionate terms ("mi amor", "mamita") are family warmth, not romance.

Each person has a PROFILE: their language, regional dialect, how confident we are about the dialect, and notes of regional words they've used. You receive the speaker's profile, the listener's profile and what the speaker just said. Do two jobs:

1. UPDATE THE SPEAKER'S PROFILE from the evidence in this utterance.
   - Identify the language(s). People often CODE-SWITCH: Spanglish, Spanish with French, a French phrase inside a Spanish sentence. A mixed utterance never replaces the profile. Instead add every other language they used to "also_speaks" (English names, e.g. ["French"], max 4, keep existing ones).
   - Replace the profile's main language only when the utterance is ENTIRELY in a different language that is not the listener's language and not already in also_speaks: new language, best-guess dialect, confidence 0.2-0.4, notes cleared, also_speaks kept. If they speak entirely in a language already in also_speaks, keep the main language.
   - Identify the regional dialect from vocabulary, pronouns and verb forms (voseo, vosotros, ustedes), idioms, spelling and slang. Be specific (e.g. "Honduran Spanish (Caribbean coast)", "Mexican Spanish (Northern)", "Brazilian Portuguese (São Paulo)", "Egyptian Arabic").
   - Keep the existing dialect unless this utterance gives clear contrary evidence. Raise confidence by about 0.1 when evidence agrees; lower it when it conflicts. Never above 0.95. A sentence with no regional markers changes nothing.
   - Add up to 3 new distinctive regional words or expressions from this utterance to notes, as "word = meaning in English". Keep notes at most 20 items; drop the least useful.
   - Include "ui" ONLY if the speaker profile has no ui yet, its language changed, or the label should now show the country; otherwise omit it. "ui" holds short button strings in the speaker's own language: label = the language's name in that language, plus the country in parentheses once confidence >= 0.6 (e.g. "Español (Honduras)"); idle = "Tap to talk"; listening = "Listening… tap to stop"; busy = "Translating…"; empty = "Didn't catch that. Try again." (all translated, in the speaker's dialect).

2. TRANSLATE what the speaker said into the LISTENER's language and dialect. With mixed-language speech, translate EVERY part that isn't already in the listener's language into one smooth sentence; never leave a phrase untranslated (except names). Translate natural, warm, spoken, informal family register, using that dialect's normal words and forms (e.g. voseo for Honduran Spanish). Use the speaker's notes to understand regional words; convey meaning, not word-for-word. Keep times, amounts, names, allergies and medicine exact. If something is genuinely unclear, give your best reading and add "(?)".

AUTO / LOCKED PROFILES:
- If the speaker profile has no language yet ("auto": true), create it from scratch from this utterance and set "auto": false.
- If the speaker profile has "locked": true, the person chose their language: keep its code, name and dialect exactly; only add notes and also_speaks, and fill ui.
- If the LISTENER profile has no language yet, set translation to "" (we can't translate until they speak).

WRONG BUTTON: only when the speaker profile already has a language. If the utterance is ENTIRELY (not partly) in the LISTENER's language, the wrong button was probably pressed. Then do not change the speaker profile (return it unchanged), set wrong_button true, and translate into the SPEAKER's profile language instead.

PRACTICE: if the speaker profile already has a language and the utterance is MOSTLY in the LISTENER's language but looks like the speaker's own learner attempt (grammar mistakes, very simple or textbook phrasing, mixed-in words from the speaker's language), it is NOT a wrong button. Set practice true and wrong_button false, keep the speaker profile unchanged, set translation to the natural, correct way to say it in the listener's dialect (so the listener hears it said properly), and fill coach.correction.

COACH (when speaker_profile.learn is true, or practice is true): add
"coach": {
  "pronunciation": the translation respelled so a speaker of the SPEAKER's language can read it aloud, stressed syllables in CAPS (e.g. "yah koh-MYOH, lah SYES-tah es ah lahs DOHS"),
  "tip": one short, friendly tip written in the SPEAKER's language about a useful word, grammar point or how people in the listener's dialect say this (max 25 words),
  "correction": null, or when practice is true {"better": the natural correct version, "why": short kind explanation in the SPEAKER's language of what to change}
}
Otherwise set "coach": null.

MIX: always report which languages the utterance used, in order of how much, as "mix": ["es", "fr"] (ISO 639-1). One entry if it wasn't mixed.

Reply with JSON only (translation first):
{"translation": "...", "mix": ["es"], "speaker": {"code": "ISO 639-1", "name": "English name of language", "dialect": "...", "confidence": 0.0, "also_speaks": [], "notes": ["..."], "ui": {"label": "", "idle": "", "listening": "", "busy": "", "empty": ""}}, "wrong_button": false, "practice": false, "coach": null}`;

function parseProfile(raw) {
  try {
    const p = JSON.parse(raw || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export async function POST(req) {
  if (!hasKey()) {
    return Response.json({ error: 'Server is missing OPENAI_API_KEY' }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const audio = form.get('audio');
    const slot = form.get('slot') === 'top' ? 'top' : 'bottom';
    const speaker = parseProfile(form.get('speaker'));
    const listener = parseProfile(form.get('listener'));
    const pitch = Number(form.get('pitch')) || 0;
    if (pitch >= 60 && pitch <= 450) {
      // Running average so one odd recording doesn't change the voice
      speaker.pitch = speaker.pitch ? speaker.pitch * 0.6 + pitch * 0.4 : pitch;
    }

    if (!audio || typeof audio === 'string' || audio.size < 500) {
      return Response.json({ error: 'empty' }, { status: 422 });
    }

    // 1. Speech -> text (any language; learned regional words help the transcriber)
    const original = await transcribe(audio, speaker.notes || [], [speaker.name, ...(speaker.also_speaks || [])]);
    if (!original) return Response.json({ error: 'empty' }, { status: 422 });

    // 2. Detect language + dialect, translate and coach, in one call.
    const result = await chatJSON(SYSTEM, { speaker_profile: speaker, listener_profile: listener, utterance: original }, 700);
    const translated = String(result.translation || '').trim();
    const practice = Boolean(result.practice);
    const wrongButton = !practice && Boolean(result.wrong_button);
    const coach = result.coach && (speaker.learn || practice) ? result.coach : null;
    const newSpeaker = result.speaker || {};
    if (!newSpeaker.ui) delete newSpeaker.ui;
    const updatedSpeaker =
      wrongButton || practice
        ? speaker
        : { ...speaker, ...newSpeaker, pitch: speaker.pitch, auto: false, locked: speaker.locked, turns: (speaker.turns || 0) + 1 };
    if (speaker.locked && !wrongButton && !practice) {
      // A language the person chose themselves never changes on its own
      Object.assign(updatedSpeaker, { code: speaker.code, name: speaker.name, dialect: speaker.dialect, ui: speaker.ui });
    }
    const needsListener = !wrongButton && (!listener.code || listener.auto);

    // 3. How the page should voice it: listener's language/accent, speaker's voice.
    const target = wrongButton ? speaker : listener;
    const speech = translated && !needsListener ? { text: translated, ...voiceFor(target, speaker, slot) } : null;

    // Never lose a second language once learned
    const alsoSpeaks = [...new Set([...(speaker.also_speaks || []), ...(updatedSpeaker.also_speaks || [])])]
      .filter((l) => l && l !== updatedSpeaker.name)
      .slice(0, 4);
    if (!wrongButton) updatedSpeaker.also_speaks = alsoSpeaks;
    const mix = Array.isArray(result.mix) ? result.mix.slice(0, 4).map(String) : [];

    return Response.json({
      slot,
      original,
      translated,
      mix,
      wrongButton,
      practice,
      coach,
      needsListener,
      speaker: updatedSpeaker,
      speech,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message || 'Something went wrong' }, { status: 500 });
  }
}
