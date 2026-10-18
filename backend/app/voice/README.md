# Voice pipeline (owner: M3)

Episode JSON in, signed `.sahpaathi` pack out (layout: [docs/EPISODE_SCHEMA.md](../../../docs/EPISODE_SCHEMA.md#pack-sahpaathi-built-by-voice)).

```
episode.json -> tts.py (Sarvam ta/hi/or/en, splicer.py for sat) -> audio.py (-16 LUFS, opus 16 kbps)
             -> pack.py (episode.json + sha256 map + Ed25519) -> .sahpaathi
             -> recap.py (ivr_recap lines -> one 8 kHz WAV for the absentee call)
```

Run everything from `backend/` with ffmpeg on PATH (`python -m ...`).

## One-time setup
```bash
python -m app.voice.build keygen        # prints PACK_SIGNING_KEY and PUBLIC_KEY
```
- `PACK_SIGNING_KEY` goes in `backend/.env` (and the Render env vars). **Never commit it or paste it in chat.**
- `PUBLIC_KEY` goes in `app/.env` as `VITE_PACK_PUBLIC_KEY` (and the Vercel env vars). Public, safe to share.
- Get a Sarvam AI key and put it in `backend/.env` as `TTS_API_KEY`.
- Rotating the signing key means every installed app needs the new public key, so rotate only if it leaks.

## Build a pack
```bash
python -m app.voice.build pack ../content/samples/g1-counting-hi-ta.json -o out.sahpaathi --recap recap.wav
python -m app.voice.build pack <episode.json> -o out.sahpaathi --santali ../content/voices/santali
python -m app.voice.build pack <episode.json> -o out.sahpaathi --fake    # tones, no key needed
python -m app.voice.build qa out.sahpaathi                               # size, loudness, line length
```
`--fake` is for wiring tests only; a pack built with it plays tones, not speech. Run `qa` on every
pack before it goes to a classroom: it exits non-zero for a pack over 2 MB, a line that is not within
1.5 LU of -16 LUFS, or a line longer than 45 s. Paste the one-line summary into `docs/TESTING_LOG.md`.

## Santali (phrase bank, no TTS)
1. A native speaker fills `text` (Ol Chiki) and `consent` (signed form id, never a name) in
   `content/voices/santali/phrases.csv`. Add rows for any phrase a lesson needs.
2. Record one phrase per file into a **local folder outside the repo** (e.g. `~/santali-inbox/`), named
   `<id>.m4a` (wav, mp3, ogg and opus also work). Raw recordings are never committed.
3. `python -m app.voice.phrases status ../content/voices/santali/phrases.csv ~/santali-inbox` lists what is missing.
4. `python -m app.voice.phrases import ../content/voices/santali/phrases.csv ~/santali-inbox -o ../content/voices/santali`
   converts to 24 kHz mono WAV, trims silence, and writes `clips/` and `phrasebank.json`. Rows without text,
   consent or audio are skipped and listed. Re-running keeps clips imported earlier.
5. Commit `phrases.csv`, `phrasebank.json` and `clips/` only for rows whose consent form is on file.
6. Give the scriptwriter the recorded phrases so Santali lines use only those:
   `python -m app.voice.phrases texts ../content/voices/santali > /tmp/bank.json`, then
   `python -m app.factory.scriptwriter <lesson> <district> /tmp/bank.json`.

## Troubleshooting
| Symptom | Cause |
|---|---|
| `ffmpeg is not installed or not on PATH` | install ffmpeg and reopen the terminal |
| `PACK_SIGNING_KEY is not set` | run `keygen`, add it to `backend/.env` |
| `voice failed: line 'x': provider has no 'sat' voice` | pass `--santali <dir>`; Santali is never synthesised |
| `not in the phrase bank, starting at ...` | the line uses words nobody recorded; record them or regenerate the episode with the bank |
| App says "pack signing key invalid / signature not valid" | `VITE_PACK_PUBLIC_KEY` does not match the key that signed the pack |

## Speaker intelligibility test (3 m, with the real ₹500 speaker)
Needs the phone, the Bluetooth speaker and 3 or more listeners (adults are fine for the first round). Roles only in the log, no names.
1. Build a pack of a real episode with the real voices and run `qa` on it (it must pass).
2. Pair the phone with the speaker. Set the phone volume to 70% and note the speaker's own volume setting.
3. Put listeners 3 m from the speaker in a quiet room, then repeat in a room with fan or street noise.
4. Play 10 short guide lines (numbers and instructions, in the home language and in the school language). Each listener writes what they heard.
5. Score: lines understood word for word, out of 10, per listener, per room. **Target: 9 out of 10 or better in the quiet room, 8 out of 10 in the noisy room.**
6. Log one row in `docs/TESTING_LOG.md`: date, speaker model, volume, room, listeners (roles), score, what was misheard.
7. For every misheard line, check whether it is a voice problem (change `pace`/voice in `sarvam.py`), a loudness problem (re-run `qa`), or a wording problem (tell M1: shorter, simpler words).
