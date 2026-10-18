# Voices: community phrase banks

Santali has no usable TTS, so Santali lines are spliced from recordings of community speakers.
**Nothing goes in this folder without the speaker's written consent.** Never commit a recording whose
consent form is not on file with the team; never write a speaker's name or phone number here.

```
voices/santali/
  phrasebank.json     [{ "text": "<Ol Chiki phrase>", "clip": "clips/greet-01.wav", "consent": "<form id>" }]
  clips/*.wav         16-bit mono WAV, one sample rate for the whole bank (e.g. 24000 Hz)
```

- `text` is exactly what the scriptwriter may use (`load_phrasebank` feeds it as the phrase list).
  A Santali line is valid only if it is built from whole phrases, joined by spaces.
- `consent` is a reference to the signed form (e.g. `form-003`), not a name. A row without it is refused.
- Record one phrase per clip, quiet room, phone held 15 cm away, a beat of silence either side.
- Record the phrases the Santali to Odia lessons need first: greetings, "listen", "say it with me",
  "well done", "try again", numbers 1 to 20, "show me N pebbles".
