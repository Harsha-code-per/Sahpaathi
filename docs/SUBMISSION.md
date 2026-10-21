# Build-stage submission checklist

Due **Sun 1 Nov 2026, 23:59 IST** on Hack2Skill. Target: **Sat 31 Oct, 18:00 IST**. Owner of this list: M1; each item has an owner.

## 1. Demo version
- [ ] Hosted web link (app) works on desktop and Android Chrome, and stays up through 2–9 Nov (backend kept warm) (M4)
- [ ] Frozen: tag `v1.0-build`, no deploys after submitting (M4)
- [ ] Test credentials for every role, in README: **teacher**, **reviewer** (native speaker / DIET), **admin** (CRP) (M4)
- [ ] 3–5 sample inputs that show it at its best, in README (M1), e.g.:
  - Grade 1 · counting to 20 · Chennai · Hindi → Tamil (migrant children)
  - Grade 2 · place value (tens and ones) · Madurai · Tamil (Santali → Odia once the phrase bank is recorded)
  - Grade 3 · subtraction with borrowing · Madurai · Tamil
  - "Need a simpler analogy" mid-episode, then airplane mode
  - Mark a child absent → catch-up call in the IVR simulator
- [ ] Offline instructions for evaluators: install the PWA, turn on airplane mode, play (M2)

## 2. Source code
- [ ] Repo public (open source = +$250 credits) or read access for the Tech4Dev evaluator IDs (M1)
- [ ] README: setup, run locally, `backend/.env.example` + `app/.env.example`, **list of every external AI service/model and where keys are needed** (M1)
- [ ] No secrets in git history (`git log -p | grep -iE "sk-ant|api_key="` is clean) (M4)
- [ ] No real users' personal data (names, phones, photos, voices without consent) (all)
- [ ] No commits after the deadline (all)

## 3. Three-minute demo video (public YouTube)
- [ ] 0:00–0:30 Challenge: one teacher, three grades, two languages, absent children
- [ ] 0:30–1:45 UI walkthrough: Studio generates → guardrail scores → approve → teacher plays it in airplane mode over the speaker → taps branch
- [ ] 1:45–2:30 Key features: home-language bridge, analogy button, chalk sketch, catch-up call on a keypad phone
- [ ] 2:30–3:00 Ease of use: one tap to start, ~10 s per tap, nothing to prepare; real teacher feedback clip (with consent)

## 4. Short PPT deck
- [ ] AI/LLM usage in layers: input → processing → guardrails → evaluation → output ([ARCHITECTURE.md](ARCHITECTURE.md))
- [ ] Guardrails: how wrong or unsafe outputs are caught
- [ ] Real scenarios: low connectivity, low data, low-cost devices; what needs a network, and what degrades gracefully
- [ ] User inputs and testing (1–2 pages) from [TESTING_LOG.md](TESTING_LOG.md)
- [ ] Future roadmap (1–2 pages) from [ROADMAP.md](ROADMAP.md)
- [ ] Re-check every statistic against its source (UDISE+ 2024-25, ASER 2024, DoT, EDC IRI)

## 5. Online AI teacher (only if the team decides it ships with this submission)
- [ ] Decision recorded in [STATUS.md](STATUS.md#2-online-mode-built-early-as-a-prototype-decision-needed) (M1)
- [ ] PRs #77, #75, #76 merged and the live `/tutor` tried end to end on a phone: chat, "teach me ...", a wrong answer, a break, "explain in Hindi" (M3)
- [ ] `ANTHROPIC_API_KEY` is set on Render (and `TTS_API_KEY` for the real voice); the daily caps are acceptable (M1)
- [ ] The deck and video call it a **prototype**; say that the camera sensing is rule-based, opt-in, on-device, and **not tested with real faces** (M3)
- [ ] The camera feature is demoed with **adults only**; no child's face on video until the DPDP legal review and a parental-consent flow exist (all)
- [ ] The AI teacher's Hindi, Tamil and Odia checked by a native speaker, or labelled unreviewed (M1)

