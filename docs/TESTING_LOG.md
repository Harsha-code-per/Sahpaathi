# User testing log

Evidence for "proof of testing and refinement based on user input" (part of the 35% criterion) and the deck's User Inputs & Testing pages.

**Rules:** roles only, never names or phone numbers. Photos, video or voice only with written consent, and **never committed**: store them in the team drive and link from here. Each finding should end in a change with a commit/PR link.

**How:** run each session with [TEACHER_INTERVIEW.md](TEACHER_INTERVIEW.md) and [CONSENT_FORM.md](CONSENT_FORM.md). Write one row per finding, not per session. *Hyp.* is the hypothesis (H1–H8) it tests. *Priority* is `next session`, `submission` or `roadmap`.

| # | Date | Who (role, setting) | Hyp. | What we tested | What we observed | Priority, owner | What we changed (PR) |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-21 | M1, education mentor (project lead in school education, Central Square Foundation), 40-minute virtual session with a live demo | | Positioning and classroom fit of the offline product | Calling it a "second teacher" jumps the gun: in a noisy room a speaker alone may not solve active learning. Better positioned as a structured audio-guided learning companion that helps a teacher manage groups | submission, M1 | 25 Oct: lesson activities and teacher controls. 1 Nov: the landing page, README, deck and video say "classroom companion", not "second teacher" |
| 2 | 2026-10-21 | M1 | | Claims | We can claim engagement at this stage, not that learning happened or a competency was mastered | submission, M1 | 1 Nov: README, deck and video claim engagement only; the Evidence page says nothing here shows children learn more |
| 3 | 2026-10-21 | M1 | | How it looks in action | Show how it runs: the teacher sits with those who need her most, the other group follows the audio, a strong child acts as facilitator. That direction must reach the teacher | submission, M1 | 1 Nov: a "Set up the room" card before every lesson, in four languages |
| 4 | 2026-10-21 | M1 | | Online study mode | Grade 1–3 children cannot navigate or use it alone. It suits older children, or parents at home | submission, M1 | 1 Nov: `/tutor` is labelled a prototype parent helper and removed from the landing hero. 25 Oct: a short spoken note for parents (`/tutor/summary`) |
| 5 | 2026-10-21 | M1 | | Focus | Few features that work beat many. Narrow to one priority: one teacher, two groups, in foundational maths | submission, M1 | 25 Oct onward: work moved back to the classroom loop. Lessons stay Grades 1–3 maths, tagged to NIPUN outcomes. The camera sensing stays off |
| 6 | 2026-10-21 | M1 | | Script engagement | Are instructions clear enough for a Grade 2 child, and engaging enough to act on? Check against strong audio such as Pratham's, and feed state teacher guides into generation | roadmap, M1 | 25 Oct: five practice lessons with different activities (pebble task, slate, pair work, song, story). **Not yet done:** state teacher guides as model input; testing with children |
| 7 | 2026-10-21 | M1 | | Indic language accuracy | Indic language models err in deployment. Launch with a caveat: data from real users, and a rubric, are needed | roadmap, M1 | Native-speaker sign-off stays a required guardrail; Santali waits for consented recordings; the deck states the caveat |

## Low-connectivity checks (team, no users)

Production build (`vite preview`) in Chrome at 390 px, phone emulation. These rows are engineering evidence for the "works in real low-connectivity conditions" criterion; repeat them on the real ₹7k phone and speaker.

| # | Date | Condition | What we tested | Result | What we changed (PR) |
|---|---|---|---|---|---|
| L1 | 2026-10-19 | Offline, after one online visit | Load the app; play the sample lesson; tap a checkpoint; let the 10 s fallback fire; save attendance (2 absent) | Everything worked; 3 events queued ("3 to sync") | none needed |
| L2 | 2026-10-19 | Back online | The queue sends by itself | **Failed:** `online` fired before data flowed, the one flush failed, nothing retried; events waited until the app was reopened | Flush every 30 s as well ([#43](https://github.com/Harsha-code-per/Sahpaathi/pull/43)); after it, the queue drained 20 s after the API came back, with no `online` event. Server stored both taps and queued catch-up calls for both absentees |
| L3 | 2026-10-19 | Slow 3G, CPU 4× slower, first visit | Time to the lesson list | 6.6 s, 96 KB transferred | none needed |
| L4 | 2026-10-19 | Slow 3G, CPU 4× slower, repeat visit | Time to the lesson list (service worker cache) | 0.5 s | none needed |
| L5 | 2026-10-19 | Mobile Lighthouse | Accessibility, best practices | 100 and 100 | none needed |

| L6 | 2026-11-01 | Offline, phone emulation, production build | Audit before submission: the live site played no sound (packs failing on a rejected voice key, built-in lessons were text only) | **Failed**, then fixed: voice key replaced, 77 lines of the five built-in lessons voiced (550 KB). Offline, the first lines load from the service worker and play | Built-in lessons now speak with no login and no signal |

## Voice pack QA (M3, `python -m app.voice.build qa`)

Real Sarvam voices, Ed25519-signed, built locally on 2026-10-19. QA checks size (under 2 MB), every line within 1.5 LU of -16 LUFS, and no line over 45 s. This is an engineering check only; **no native speaker has listened to these voices yet**.

| # | Date | Pack | Result | What we changed (PR) |
|---|---|---|---|---|
| V1 | 2026-10-19 | g1-numbers-to-20-chennai-migrant | 1101 KB, 129 lines, 9.7 min. **Failed:** `s2-c7` at -18.8 LUFS | Gain is now re-measured on the encoded line and corrected (this PR); rebuilt: 1103 KB, all checks passed |
| V2 | 2026-10-19 | g3-place-value-hundreds-chennai-migrant | 1157 KB, 144 lines, 10.0 min. **Failed:** `s5-e1` at -17.6 LUFS | Same fix; rebuilt: 1158 KB, all checks passed |
| V3 | 2026-10-19 | g3-place-value-hundreds-madurai-tamil | 1177 KB, 138 lines, 10.1 min. All checks passed | none needed |
