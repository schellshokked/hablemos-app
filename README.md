# Hablemos

A family interpreter web app: English ⇄ Honduran Spanish (and any other language), built so I can talk with my mother-in-law when my wife isn't around. Runs in the browser and installs on an iPhone from Safari ("Add to Home Screen").

## Features

**Face-to-face mode** (`/`)
- Phone lies flat between two people; the top half is upside down for the person across the table.
- Tap your button and talk; recording stops on its own when you pause. Text appears first, then the voice.
- Each side picks a language (🌐 chip), or auto-detects it. Dialect is detected and refined every turn (vocabulary, voseo, slang) and remembered per phone.
- Learned regional words are fed back into transcription so it hears that person better over time.
- Translated speech uses a voice close to the speaker's own pitch, in the listener's accent.
- 🎓 Learn mode: how to say it yourself, a pronunciation guide, a tip, slow replay, and gentle corrections when you try the other language.

**Mesa mode** (`/mesa`) for family dinners
- Listens to the whole table and shows live captions in your language.
- 🤔 *What's going on?*: a short catch-up on the last few minutes.
- 🙋 *Help me jump in*: one natural thing to say, with pronunciation and audio.

## How it works

Next.js (App Router) on Vercel, one OpenAI API key.

| Step | Model | Where |
|---|---|---|
| Speech → text | `gpt-4o-transcribe` | `lib/openai.js` |
| Dialect detection, translation, coaching | `gpt-4.1-mini` | `app/api/translate`, `app/api/caption`, `app/api/mesa` |
| Text → speech | `gpt-4o-mini-tts` (falls back to `tts-1`) | `app/api/speak` |

Browser-side listening (pause detection, pitch) lives in `lib/listen.js`. Language profiles are saved in the browser's localStorage.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your OpenAI key
npm run dev                  # http://localhost:3000
```

## Deploy

Import this repo in Vercel and set the environment variable `OPENAI_API_KEY` (Production). Every push to `main` redeploys.

Optional overrides: `OPENAI_STT_MODEL`, `OPENAI_TEXT_MODEL`, `OPENAI_TTS_MODEL`.

## Notes

- Anyone with the URL can use it on your OpenAI credit; don't share the link publicly.
- Tune the starting Honduran word list in `app/page.js` (`DEFAULT_PROFILES`).
- Let people know when the phone is listening and translating.
