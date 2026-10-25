# Sahpaathi status (21 Oct 2026)

**Short answer:** the **offline classroom product is complete**, and everything in the original build plan works. The plan agreed on 18 Oct left **Online Mode** for the Top 10 stage; **a prototype of it was built early on 21 Oct and is now in `main` and live**, with its camera sensing switched off (section 2). What stands between us and a winning submission is mostly **evidence and people**, not code.

Live: app https://sahpaathi.vercel.app (all four routes load), API https://sahpaathi-api.onrender.com (healthy, CORS works; kept awake by an uptime monitor on `/health`). CI green on main. Merged since the first version of this report: the cinematic landing (#68), the demo-account **Fill in** button (#69), speed-ups (#72). Also merged: deploy from GitHub Actions (#74, #81: every merge to main now deploys the app), the Online Mode stack (#75–#79, #82) and **auto-merge** (#83: a PR into main merges itself once the backend and app checks pass; a draft or the `hold` label opts out). Ignore the red Vercel X on PRs: the Actions deploy replaces it.

## 0. Stability audit (21 Oct)
The site white-screened on clicks and felt unstable. Found and fixed:
- **Tutor crash** (#92): sending any message blanked `/tutor`. An effect returned `scrollIntoView()`'s Promise to React as its cleanup.
- **White screen after every deploy** (#92): tabs and the service worker asked for deleted code files, and Vercel answered with the HTML page. Missing assets now 404, lazy pages reload once, and an error boundary plus loading spinner cover every section.
- **Unguarded API data, stuck sign-outs, no timeouts** (#92): status lookups fall back, a 401 signs out cleanly, there is a 90 s timeout, and a "waking the server" hint shows during cold starts.
- **Spending and abuse** (#94, on `hold` until Render's `JWT_SECRET` is confirmed): caps are kept in the database (tutor per caller and overall, packs, sign-in), Exotel rings only an allowlist, request bodies are size-limited, the default JWT secret is refused, and the boot fails safe.
- **Class Health board and sample data** (#90, #93): merged with fixes. The `demo-` prefix is reserved, sample calls are labelled, and the board is accessible.
- **Sign-in background** (#95): the video is back, re-edited without the hard cuts or the watermark.
- **Quality gates** (#96): `AGENTS.md` (the six judging criteria as rules), accessibility lint, Prettier, coverage floors, a **browser smoke test** on every PR (every page, desktop and phone, no white screen, axe clean), secret and dependency scans, Dependabot, and a live check after each deploy. It also fixed SQLite sharing one connection across threads (local and test runs only).

## 1. The original plan, item by item

| # | Planned feature | Status | Notes |
|---|---|---|---|
| 1 | **Content factory** (Sonnet 5.5 writes a whole lesson) | ✅ Done | Segments, pauses, easier/core/stretch, analogy, materials, IVR recap, chalk sketch. 8 chapters, 3 districts. Keeps the better of two attempts |
| 2 | **Four guardrails** | ✅ Done | Tier 1 code (every sum, language handover); tier 2 Haiku rubric; tier 3 blind back-translation beside every line (no numeric "drift score" was added); tier 4 a human edits lines and approves. **Measured: 18/20 strict, 20/20 any tier** ([GUARDRAIL_EVAL.md](GUARDRAIL_EVAL.md)) |
| 3 | **Voice** | 🟡 Mostly | Real Sarvam voices for Tamil, Hindi, Odia with loudness QA. **Santali: splicer built, 0 of 42 phrases recorded or consented** |
| 4 | **Packs** (signed zip; import, share, download) | 🟡 Built, blocked live | Ed25519-signed and verified; import from file, Web Share, in-app download that resumes on 2G. **The live site refuses packs: `VITE_PACK_PUBLIC_KEY` is not set on Vercel** |
| 5 | **Offline teacher player** | ✅ Done | One-tap start, checkpoints, 10 s fallback, analogy, chalk sketch, materials, attendance, sync queue with retry; airplane mode lab-tested ([TESTING_LOG.md](TESTING_LOG.md) L1–L5); in Tamil, Hindi and Odia. The next line, and all three branches at a checkpoint, are now preloaded so a tap starts at once (`upcoming()` in `player.ts`); switch time is still unmeasured on a real phone |
| 6 | **Choral mic sensing** | ✅ Done | Suggests a branch; the teacher decides |
| 7 | **Absentee catch-up calls** | 🟡 Built, not live | Queue, keypad simulator, real Exotel calling ([EXOTEL.md](EXOTEL.md)). **Not configured on Render; no real call made yet** |
| 8 | **Studio + dashboard** | ✅ Done, beyond plan | Line editing, collapsible sidebar, charts, lesson-pipeline Kanban, **classroom feedback loop** |
| 9 | **Roles + test accounts** | 🟡 Mostly | Teacher, reviewer and admin work, and the Studio and Admin sign-in pages now show the accounts with a **Fill in** button (merged). The sign-in pages fetch the demo password from the API, so it shows with no Vercel setting |
| Upgrades | Choral mic, simpler-analogy button, morning chalk sketch | ✅ All done | |

**Built beyond the plan:** the Chalk & Marigold redesign with logo and favicon, the landing page, the teacher app in three languages, in-app lesson download, the classroom feedback loop (Claude rewrites the part classes struggled with), the guardrail evaluation, the cost model ([ROADMAP.md](ROADMAP.md#what-it-costs)), a daily cap on lesson generation, and keep-warm for the judging week (an uptime monitor on `/health`; the GitHub cron ran too rarely to rely on).

**Deliberately cut, on the roadmap:** RAG over the curriculum, a job queue, mesh pods and micro-capsules. (Online Mode was cut too, then prototyped early: section 2.)

## 1b. The pitch deck (Sahpaathi_A1pha.pdf), claim by claim
The deck is the reason we were selected, so its core loop comes first. Checked against the code on 25 Oct.

| Deck claim | In the product | Gap |
|---|---|---|
| Teacher taps once; the episode is already on the phone | Library, one-tap start, zero prep screen | none |
| 15-min home-language episode: call-and-response, slate tasks, songs | Episode schema, Claude scriptwriter, 3 districts, 8 chapters | deck says 20 Grade 1-3 episodes; we have 8 chapters |
| Most / Some / Few tap picks an easier / core / stretch branch, offline | `player.ts`, airplane-mode tested, 10 s fallback, preloaded audio | not measured on the ₹7k phone |
| Home language bridges to school language | Lines carry `lang`; handover checked by guardrail tier 1 | Santali: 0 of 42 phrases recorded |
| Absent children get a free call-back | Queue, IVR flow, keypad simulator, Exotel client | not configured, no real call |
| Packs move phone-to-phone, SD, weekly | Signed packs, Web Share, resumable download | live site refuses packs until `VITE_PACK_PUBLIC_KEY` is set; Nearby Share/SD are the OS file picker, not custom code |
| Guardrails: rules, rubric, back-translation, native review | All four, 18/20 strict | native-speaker sign-off needs people |
| Attendance, sync queue, CRP dashboard | Done | none |
| "Plans the week around each grade's progress"; packs "re-tuned to the class" | Feedback loop rewrites weak parts; Today's plan card | Partly built: a **Today's plan** card on the lesson list suggests a new lesson, one the class struggled with, or the one played longest ago, with what to keep ready (`teacher/plan.ts`, from the phone's own taps, offline). Packs are not re-tuned automatically: say "re-tuned from feedback" |
| Bhashini / IndicTrans2 / RAG pgvector / Kotlin app | Sarvam TTS, PWA | the deck's stack slide differs from what shipped; update it |

**Teacher app, 25 Oct (all phone-tested on a moto g34):** five built-in practice lessons in different activity types (pebble task, slate, pair work, song, story: `content/samples/`), a **class-settings panel** (speech speed, longer time to answer, voice boost up to 2x, large text), a **room-noise check** that sets the boost for you (honest limit: it makes the voice louder and slower, it cannot remove noise), replay and skip a line, an **attention bell**, **continue from where you left off**, an end-of-lesson **class summary**, and a restyled lit-blackboard look (hero card, slate cards, floating tab bar). The room check and voice boost need a real microphone/audio permission and were not exercised on the phone.

**Live checks, 25 Oct (from outside, without logging in):** the live site's bundle contains the pack public key, so `VITE_PACK_PUBLIC_KEY` is now set on Vercel; the API's public demo endpoint says `DEMO_PASSWORD` is set on Render; `/api/v1/recordings` is deployed (401 without a login); `/health` is ok; deploys run from GitHub Actions on every merge. **Not verifiable without a sign-in:** that Render's `PACK_SIGNING_KEY` is the private half of that public key, i.e. that a built pack downloads and verifies in the Teacher app. Test: sign in under Lessons > Get new lessons and download one; a wrong key shows a signature error.

**Shelf (25 Oct):** a fifth tab. *Books and notes*: links to the official NCERT textbook page, DIKSHA, NIPUN Bharat and e-Pathshala (no book is copied into the repo; they are NCERT's and large), plus a shelf of PDFs the teacher adds herself (a chapter she downloaded, a worksheet, her own notes), filed by subject and grade, kept on the phone and readable with no signal, up to 25 MB each, with a storage meter. *My recordings*: every recording she has made, filed by subject then grade, with play, save a copy, send now, review text and delete. NCERT's own site did not answer from our build machine, so only its main textbook page is linked; direct chapter links are not guessed.

**Plan and record (25 Oct):** a **Plan** tab. The teacher picks a subject folder (Maths, Language), then a grade box, and that grade's topics line up in teaching order on the days she teaches (she can move any topic, or press *Arrange for me*: new topics first, then ones her class found hard). Each topic has a **Record** button: she reads the lines in her own voice (the phone's noise suppression and echo cancellation are on), listens back, saves it on the phone, and sends it. The server stores it and an AI reviews it (Sarvam speech-to-text, then Claude Haiku: clarity, accuracy, pace, child-friendliness, safety, tips); the review comes back into the app. Recordings queue on the phone until she is signed in and online. Backend: `app/recordings.py`, 6 tests; app: `Timetable.tsx`, `Recorder.tsx`, `schedule.ts`, `recordings.ts`. Tested end to end against a local backend with a synthetic microphone (upload, storage, and the real Sarvam speech-to-text call worked). **Not yet tested:** a real human voice on a phone, and the Claude review step (needs `ANTHROPIC_API_KEY`, which Render has). The recording is for the teacher's own use and review; playing it back as the lesson audio is not built.

Also added after phone testing (moto g34, driven over Chrome's debug port): Pause/Resume, screen kept awake during a lesson, and a confirm before leaving a lesson mid-way. Phone-tested: Most and Few taps switch branches, the Hindi bridge plays, the lesson finishes.

The Vercel project is not visible to the `loktrishal` account, so `VITE_PACK_PUBLIC_KEY` must be set by Harsha.

What blocks the rest is config and people, not code: Vercel key, Exotel, Santali speaker, native reviewers, a real-phone test.

## 2. Online Mode: built early as a prototype, live with the camera off
Planned on 18 Oct as a 1-on-1 AI tutor for connected learners, to be prototyped only in the Top 10 stage on a separate branch. **A working prototype was built on 21 Oct** and is in `main`. Plan and feature-by-feature status: [MODES.md](MODES.md); the camera part: [SENSE.md](SENSE.md).

| Piece | PR | Status |
|---|---|---|
| The AI teacher at `/tutor`: chat, study mode (topic, PDF or photo analysed into parts), teach, quiz, hint, reteach, breaks and games, four languages, voice in and out | #75 | ✅ Built and tested (about 40 backend tests on the engine, breaks and API, and real-Claude runs in a real browser). Voice not tried with a real microphone |
| Two modes made visible: landing section, mode switch, offline warning, docs | #76 | ✅ Built |
| The `langgraph` dependency (the repo asks for dependencies in a tiny separate PR) | #77 | ✅ CI green, Docker image builds |
| Opt-in camera and microphone sensing: four LangGraph agents plus an orchestrator, on-device, a gentle "are you okay?" check-in, auto-deletion, consent gate, training tools | #78 | 🟡 Merged, **off by default** (`SENSE_ENABLED` / `VITE_SENSE_ENABLED`, #82). Built and tested with synthetic numbers and a fake camera. **Not tested with real faces**; rule-based; needs legal review (DPDP Act 2023) before any child uses it |
| Deploy from GitHub Actions, to avoid the Vercel block | #74 | ✅ Running: every merge to main deploys |

**Decided (M1, 21 Oct):** ship the AI teacher in the submission, labelled a **prototype** in the deck and video; the camera/mic sensing stays **off** on the live site (the panel is not even in the build). Switch both flags on only for an adults-only demo. Open caveats: the AI teacher's answers don't go through the four guardrails, and there are no learner accounts or verifiable parental consent yet.

## 3. Submission checklist (due 1 Nov; target 31 Oct, 18:00 IST)

| Item | Status |
|---|---|
| Hosted link up and kept warm through 2–9 Nov | ✅ |
| Test accounts and sample inputs in README | ✅ the sign-in pages show the demo accounts and password (served by the API) |
| AI services listed, `.env.example` files | ✅ |
| **User testing log** (35% criterion) | ❌ **empty**: interview #1 pending |
| **3-minute video** | ❌ script ready ([VIDEO_SCRIPT.md](VIDEO_SCRIPT.md)), not recorded |
| **Deck** | 🟡 draft; needs testing pages, guardrail numbers, costs, honest Santali status |
| Repo public, evaluator access, secrets scan, tag `v1.0-build` | ❌ submission day |
| Native-speaker check of the app text and voices (and the AI teacher's Hindi, Tamil and Odia, which no native speaker has reviewed) | ❌ |
| A one-line honest label in the deck and video: prototype, rule-based sensing, not tested with real faces | ❌ |
| Real phone and ₹500 speaker test (3 m) | ❌ |

## 4. Where we stand on each criterion

| Criterion | Weight | Today |
|---|---|---|
| **Efficacy and user focus** | 35% | Strong product, **no user evidence yet**: our weakest point and biggest lever |
| **AI and technical strength** | 30% | Strong: 4 guardrails with measured catch rates, offline proof, signed packs, resumable 2G downloads. Missing: a voiced lesson playing on the live site, a real-phone test |
| **Innovation** | 25% | Strong: AI-written IRI per district, tap-driven branching, choral sensing, catch-up calls, the classroom feedback loop |
| **Roadmap** | 10% | Good: pilot path, integration with existing systems, cost per child (₹93; ₹6 without calls), Online Mode |

## 5. Road to success

**This week: evidence (most important)**
1. **Interview #1** (21–22 Oct): notes come in, each finding becomes a TESTING_LOG row, the top fixes ship within 24 hours with before/after PR links.
2. **Field tests, 26–28 Oct**, on the real ₹7k phone and ₹500 speaker: same fix loop, plus the 3 m audio test (Loktrishal's scorer, #60).
3. **Native speakers** check the Tamil, Hindi and Odia app text (`app/src/teacher/strings.ts`) and listen to one voice pack.

**Unblock the live demo (M3)**
4. Set `VITE_PACK_PUBLIC_KEY` on Vercel and build the 3 packs on Render, so judges can download and **hear a real Tamil lesson**. The Grade 1 voiced pack is built and passes QA, saved outside the repo. The public key (safe to share) is `xCrGGtubBBisXI/FYyp0unCnqm6ez7YhLY8bkRToqKo=`, valid only if Render's `PACK_SIGNING_KEY` is the same key as the one it came from.
5. Send the Grade 1 pack file, to ship it as the **built-in real-voice lesson** (offline, no login).
6. ~~Fix #68~~ done: the cinematic landing and the Fill-in button are in main. **Ask Harsha to add loktrishal-05 to the Vercel team** (the red X on every PR), then merge #77, #75, #76, #78, #73 in that order with Rebase and merge; the stacked ones need a quick rebase after each.
6b. **Collect real data for the perception model** (optional): 10 to 15 people use `/tutor` with the camera on and press *I get it / I'm lost*, then Colab ([ml/COLAB_PROMPT.md](../ml/COLAB_PROMPT.md)). Until then the rules are used, and nothing trained on invented data may ship.

**Optional, if people can be found**
7. Exotel: settings on Render and one real call to a team phone.
8. A Santali speaker records the 42 phrases with written consent, reviving the Santali → Odia showcase.
9. A Tamil reviewer approves 3–5 more lessons; voice them.

**Freeze and ship**
- 29 Oct, 23:59: feature freeze.
- 30 Oct: final deck (testing pages, guardrail and cost slides) and video recording.
- 31 Oct: README password, secrets scan, repo public, evaluator access, tag `v1.0-build`, submit by 18:00.

**If Top 10 (10 Nov):** a parental-consent flow so Online Mode sensing can be switched on, a 10–12 slide finale deck, a rehearsed live demo with a recorded fallback, more classroom pilots.

## 6. The one thing that matters most
**Teacher evidence in the testing log this week**, each finding tied to a change we shipped. The product is complete enough to win; the 35% criterion is decided by proof that real teachers used it and that we improved it from what they said.
