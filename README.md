# Sahpaathi — an offline AI co-teacher in a ₹500 speaker

> While the teacher teaches one grade, a Bluetooth speaker paired to her phone runs a 15-minute interactive audio episode for another grade, in the children's home language, with **no internet in the classroom**.

**AI for Foundational Learning Hackathon 2026 · Challenge 01: Classroom Complexity · Team A1pha**

Sahpaathi brings back Interactive Radio Instruction (IRI) using frontier AI:
- **Claude writes the episodes.** It turns an NCERT/state textbook chapter and a NIPUN learning outcome into an IRI script localised to the district: names, crops, festivals, free props like pebbles and seeds. Every segment comes with pre-generated *easier / core / stretch* branches.
- **It adapts offline.** After each segment the teacher taps *Most / Some / Few got it*, and the episode switches branch on the device.
- **It starts in the home language.** Lessons begin in the child's home language (e.g. Santali, or Hindi for migrant children) and bridge into the school language (Odia, Tamil).
- **It reaches absent children.** A free call-back plays the missed lesson's recap on any basic phone.

| Problem in the challenge | How Sahpaathi answers it |
|---|---|
| One teacher, 2–3 grades at once | The speaker guides one grade while the teacher teaches another |
| Home language ≠ school language | Episodes bridge from the home language to the school language |
| Absenteeism leaves gaps | An IVR catch-up call to the parent's basic phone |

## Status
Build stage in progress (18 Oct – 1 Nov 2026). Plan and ownership: [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md).

## Repository
```
backend/   FastAPI API, content factory (Claude), voice + pack builder, IVR
app/       Offline PWA: teacher player (/teacher), Studio (/studio), CRP dashboard + IVR simulator (/admin)
content/   curriculum text, district profiles, sample episodes, consented community voice clips
docs/      product, architecture, episode contract, API, plan, testing log, submission checklist
```

## Run locally
Requirements: Python 3.12, Node 24, Docker, ffmpeg.

```bash
# database
docker compose up -d

# backend → http://localhost:8000/docs
cd backend
python -m venv .venv && . .venv/bin/activate   # fish: . .venv/bin/activate.fish
pip install -r requirements-dev.txt
cp ../.env.example .env                        # fill in keys (see below)
uvicorn app.main:app --reload
pytest -q

# app → http://localhost:5173/teacher
cd app
npm install
npm run dev
```

## External AI services and keys
| Service | What it does | Where it is called | Key |
|---|---|---|---|
| Anthropic Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Writes the IRI episode script and branches as structured JSON | `backend/app/factory/` | `ANTHROPIC_API_KEY` |
| Anthropic Claude Haiku 5.5 (`claude-haiku-5-5`) | Rubric judge (pedagogy, age-fit, accuracy, safety) and back-translation check | `backend/app/factory/` | `ANTHROPIC_API_KEY` |
| Indic TTS (provider TBD Day 2) | Tamil / Hindi / Odia voices, generated in the cloud before packing (never in class) | `backend/app/voice/` | `TTS_API_KEY` |
| Exotel / Twilio | Absentee catch-up call + DTMF keypad branching | `backend/app/ivr/` | `TELEPHONY_*` |

Nothing above runs in the classroom. The teacher player works with **zero connectivity** once a weekly pack is on the phone.

## Test credentials and sample inputs
Added before submission (see [docs/SUBMISSION.md](docs/SUBMISSION.md)).

## License
[MIT](LICENSE). Open source so state programmes and NGOs can adapt it.
