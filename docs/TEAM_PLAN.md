# Team plan: Build stage (18 Oct → 1 Nov 2026)

**Hard deadline:** Sun 1 Nov 2026, 23:59 IST. **Our target:** submitted by **Sat 31 Oct, 18:00 IST**.
Evaluation (2–9 Nov) uses the repo and deployment as they are at the deadline. Top 10 announced 10 Nov. In-person finale 18 Nov.

## How we're scored (Build stage)
| Criterion | Weight | What it means for us |
|---|---|---|
| Efficacy & user-centricity | **35%** | Vernacular, voice-first, big-tap UI. **Proof of testing and refinement with real teachers** (`TESTING_LOG.md`) |
| Effective AI & technical strength | **30%** | Claude where it's strong (writing, localising, judging), real guardrails, **works offline on a cheap phone** |
| Innovation | 25% | AI-generated, adaptive, hyper-local IRI; home-language bridge; IVR reach |
| Future roadmap | 10% | `ROADMAP.md` (Online Mode, state integration, more languages) |

## Ownership
| Member | GitHub | Owns |
|---|---|---|
| **M1 Harshavardhan K** (lead) | @Harsha-code-per | `backend/app/factory/` (Claude scriptwriter, 4-tier guardrails), `app/src/studio/`, `app/src/lib/types.ts`, `content/` (curriculum, districts, samples), `docs/` |
| **M2 Sanjjith B** | @Sanjjith27 | `app/` shell + PWA config, `app/src/teacher/` player, offline storage, pack import/share, attendance, sync client, `app/package.json` |
| **M3 Loktrishal K** | @loktrishal-05 | `backend/app/voice/` (TTS, Santali splicer, loudnorm + opus, pack builder, Ed25519), `app/src/sensing/` (choral mic), `content/voices/` |
| **M4 Cholan Kinnera** | @Cholan-kinnera | `backend/` core (models, migrations, auth/roles, routes, sync, `ivr/`, dashboard), `app/src/admin/`, deploy, CI, `backend/requirements.txt`, release tags |

The single shared contract is the **episode JSON** ([EPISODE_SCHEMA.md](EPISODE_SCHEMA.md)). It is frozen from end of Day 2.

## Roadmap
| Day | Goal | M1 Harshavardhan | M2 Sanjjith | M3 Loktrishal | M4 Cholan |
|---|---|---|---|---|---|
| **D0 Sun 18** | Repo ready ✅ | Scaffold + docs; **book both mentor sessions** (education + tech, booking closes 31 Oct) | Clone, `npm run dev`, read `types.ts` + sample episode | Clone, run backend tests; pick TTS provider candidates | Create Neon, R2, Render, Vercel accounts; confirm telephony account works |
| **D1–2 Mon 19–Tue 20** | **Walking skeleton:** deployed link plays one Tamil episode in airplane mode | Sonnet 5.5 writes one schema-valid episode from a real chapter + district profile; **freeze schema v1** | PWA installs; plays `content/samples/` pack offline; branch taps switch audio | TTS one episode → loudnorm −16 LUFS → opus 16 kbps → pack zip | Models + Alembic; episodes/packs API; Dockerfile (with ffmpeg); deploy backend + app; CI green |
| **D3–5 Wed 21–Fri 23** | Core features | Guardrails: schema + rules + arithmetic checker → Haiku rubric → back-translation → review queue; Studio UI | Checkpoints, 10 s fallback, analogy button, chalk-sketch card, materials list, attendance, sync queue, pack import + Web Share | Hindi + Odia voices; **record Santali phrase bank** (consented) + splicer; Ed25519 signing; choral mic module | Auth + roles + seeded test users; sync API; IVR via real provider; IVR keypad simulator; dashboard API |
| **Wed 21 / Thu 22** | **Teacher interview #1** (early prototype) | Lead the session | Demo the player | Check audio clarity | Take notes → `TESTING_LOG.md` |
| **D6–7 Sat 24–Sun 25** | Content + integration | Batch-generate **12 episodes** (stretch 20): Grades 1–3 numeracy, Tamil-led + 1 Santali→Odia; native-speaker review | Player polish | Voice every approved episode; speaker intelligibility test at 3 m | Real end-to-end call to a team keypad phone; dashboard UI |
| **D8–10 Mon 26–Wed 28** | **Field testing** in 2–3 classrooms with the kit | Prompt fixes from feedback | UX fixes | Audio fixes | Airplane-mode + Slow-3G tests; perf |
| **D11 Thu 29** | **Feature freeze 23:59.** Bug fixes only after | | | | |
| **D12 Fri 30** | Video + docs | Deck draft | Screen-record player walkthrough | Film the hardware demo (phone + speaker + keypad phone) | README final; test credentials; evaluator read access |
| **D13 Sat 31** | **Submit by 18:00**, tag `v1.0-build` | Deck final, submit | | | Release + deploy freeze |
| D14 Sun 1 Nov | Buffer. **No commits after submitting** | | | | |

**Every day:** a 10-minute stand-up (done / doing / blocked), then merge what's green.

## If we make the Top 10 (10–18 Nov)
Work on a separate branch and deployment; the submitted one stays frozen. Refine from evaluator feedback, optionally prototype Online Mode ([ROADMAP.md](ROADMAP.md)), build the 10–12 slide finale deck, and rehearse the live demo with a pre-recorded fallback video.

## Deliberately not building now
| Cut | Instead | Revisit when |
|---|---|---|
| pgvector RAG | Chapter text goes straight into the prompt | The curriculum outgrows the context window |
| Celery + Redis | FastAPI BackgroundTasks + a status column | Generation queues back up |
| Bluetooth/AUX manager | Android routes audio itself | Never |
| Mesh pods, voice+stroke capsules, step-lock, confusion pulse | Roadmap slide | After finale |
| Online Mode (camera/mic tutor, LangGraph) | Roadmap; optional finale prototype | Top 10 |
