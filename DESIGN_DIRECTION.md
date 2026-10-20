# Design direction: light landing and sign-in

Status: **proposal, awaiting approval. No code written yet.**

## Decisions already made (by the project owner, 2026-10-20)
- Light landing page and sign-in page. The teacher app stays dark (approved 19 Oct, a dark phone screen suits a classroom). Studio and Admin stay paper with a dark sidebar.
- Brand stays Chalk & Marigold, Bricolage Grotesque + Figtree (they cover Tamil, Hindi, Odia and Ol Chiki).
- No generated video for now. Motion is CSS, SVG and GSAP. Poster stills only.
- No sign-up page: accounts are seeded by the admin, so a sign-up would be a fake flow. Sign-in only.

## 1. Domain metaphor
**A voice crosses a classroom.** Sound rings leave a small speaker, and a number said in a child's home language lands as a number in the school language. Every motion beat is that crossing: rings out, words bridging, a tap choosing the branch.

## 2. Feel
Warm, clear, unhurried.

## 3. Palette (light ground, taken from chalk dust, paper, a marigold garland, slate)
| Role | Hex | CSS variable |
|---|---|---|
| Ground (chalk-paper) | `#F8F6EF` | `--ground` |
| Surface | `#FFFEFB` | `--surface` |
| Ink | `#172524` | `--ink` |
| Muted | `#55625F` | `--muted` |
| Accent (marigold, fills only) | `#F4B23E` | `--accent` |
| Accent text on light | `#8A5A00` | `--accent-text` |
| Success fill / text | `#DDF3EC` / `#145C4D` | `--ok`, `--ok-fg` |
| Warning fill / text | `#FCEFD2` / `#7A5410` | `--warn`, `--warn-fg` |

Shadows are tinted with ink (`rgb(23 37 36 / .12)`), never grey.

Contrast ratios (computed, WCAG 2.x):
| Pair | Ratio | Verdict |
|---|---|---|
| Ink on ground | 14.64 | AAA |
| Ink on surface | 15.70 | AAA |
| Muted on ground | 5.89 | AA |
| Ink on marigold | 8.51 | AAA |
| Deep marigold text on ground | 5.48 | AA |
| OK text on OK fill | 6.79 | AA |
| Warn text on warn fill | 5.93 | AA |
| **Marigold as text on ground** | **1.72** | **fails: never use marigold for text on light** |

## 4. Type
Bricolage Grotesque for display (tight, characterful, already the brand), Figtree for text. Both are already in the app, so no new font weight on 2G.

## 5. Hero archetype
**(e) Kinetic typography with an SVG sound-ring**, no media files. The headline assembles word by word. Behind it, concentric rings radiate from a speaker mark. Home-language numerals ("ஒன்று", "छह", "ଏକ") drift across the rings and settle into the school-language word. Scroll lifts the headline away and the rings widen.

Secondary moments (only these, restraint on purpose):
1. **Statement reveal:** one sentence, words fade in as they cross the viewport.
2. **Self-drawing path:** the "how it works" flow, cloud → phone → speaker → parent's phone, drawn with `strokeDashoffset`.
3. **Real counters:** only measured figures from `docs/TESTING_LOG.md`, each with its footnote. No invented numbers.

## 6. Motion signature
- Easing: `expo.out` for entrances, `power2.inOut` for scroll-linked.
- Durations: 0.8 s entrances, 60 ms word stagger, scrub smoothing 0.6.
- Lenis `lerp` 0.1, as the single scroll loop driven from `gsap.ticker`.
- **Signature interaction:** tap a "Most / Some / Few" chip in the hero and the rings change colour and speed, which is the real product interaction in miniature.

## 7. What is built
- `/` landing: light, per the above.
- `/login` (shared sign-in for Studio and Admin): light card, show/hide password, `role="alert"` errors, busy state.
- Dependencies added: `gsap`, `lenis`. Nothing else.
- Everything else (teacher, Studio, Admin charts) is untouched.

## 8. Quality gates
Reduced motion (static, text in order), keyboard-only, AA contrast, 360/768/1280/1920 widths with no horizontal scroll, LCP under 2.5 s, zero console errors. The final report will list which were actually run and which are manual checks.

## 9. Risks
- Landing is dark today, and the nav, footer and the "Open the teacher app" link lead into a dark app. The step between light landing and dark teacher app needs a visible but short transition.
- GSAP + Lenis add roughly 30 KB gzipped to the landing chunk. Code-split so the teacher app, which runs offline on 2G, never loads them.
