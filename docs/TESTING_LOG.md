# User testing log

Evidence for "proof of testing and refinement based on user input" (part of the 35% criterion) and the deck's User Inputs & Testing pages.

**Rules:** roles only, never names or phone numbers. Photos, video or voice only with written consent, and **never committed**: store them in the team drive and link from here. Each finding should end in a change with a commit/PR link.

**How:** run each session with [TEACHER_INTERVIEW.md](TEACHER_INTERVIEW.md) and [CONSENT_FORM.md](CONSENT_FORM.md). Write one row per finding, not per session. *Hyp.* is the hypothesis (H1–H8) it tests. *Priority* is `next session`, `submission` or `roadmap`.

| # | Date | Who (role, setting) | Hyp. | What we tested | What we observed | Priority, owner | What we changed (PR) |
|---|---|---|---|---|---|---|---|
| 1 | | e.g. T1, Grade 1–3 teacher, Tamil-medium govt school, Madurai | | | | | |

## Low-connectivity checks (team, no users)

Production build (`vite preview`) in Chrome at 390 px, phone emulation. These rows are engineering evidence for the "works in real low-connectivity conditions" criterion; repeat them on the real ₹7k phone and speaker.

| # | Date | Condition | What we tested | Result | What we changed (PR) |
|---|---|---|---|---|---|
| L1 | 2026-10-19 | Offline, after one online visit | Load the app; play the sample lesson; tap a checkpoint; let the 10 s fallback fire; save attendance (2 absent) | Everything worked; 3 events queued ("3 to sync") | none needed |
| L2 | 2026-10-19 | Back online | The queue sends by itself | **Failed:** `online` fired before data flowed, the one flush failed, nothing retried; events waited until the app was reopened | Flush every 30 s as well ([#43](https://github.com/Harsha-code-per/Sahpaathi/pull/43)); after it, the queue drained 20 s after the API came back, with no `online` event. Server stored both taps and queued catch-up calls for both absentees |
| L3 | 2026-10-19 | Slow 3G, CPU 4× slower, first visit | Time to the lesson list | 6.6 s, 96 KB transferred | none needed |
| L4 | 2026-10-19 | Slow 3G, CPU 4× slower, repeat visit | Time to the lesson list (service worker cache) | 0.5 s | none needed |
| L5 | 2026-10-19 | Mobile Lighthouse | Accessibility, best practices | 100 and 100 | none needed |
