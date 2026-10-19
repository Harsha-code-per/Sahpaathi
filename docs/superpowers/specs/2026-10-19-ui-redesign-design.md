# UI redesign: Chalk & Marigold

Approved 2026-10-19 by the team lead. Mockups: https://claude.ai/artifact/JYpHsYgPseH62Yqjyf4taB (boards: Foundation, Teacher app, Studio, Admin, Landing, Logo & favicon).

## Goal
The app is what teachers and judges see first. It should look polished and consistent on every screen from a 360 px phone to a 1920 px monitor, read every script correctly, and still work offline and load fast on 2G.

**Done means:** every screen matches the mockups; no empty side bands on wide screens; Tamil, Hindi, Odia and Santali render in every context (mixed-script lines included) with no network; the teacher route stays close to today's 96 KB first load on slow 3G; Lighthouse accessibility ≥ 95; all existing tests pass.

## Constraints
- The classroom app must keep working with zero signal. Nothing here may add a network dependency to `/teacher`.
- Behaviour does not change in phases 2–4: only markup and styles. Offline storage, sync, packs and the player logic stay as they are.
- `app/` and `package.json` belong to M2 (Sanjjith), `app/src/admin/` to M4 per CODEOWNERS: they review those PRs. `app/src/studio/` is M1's.
- Teacher interview #1 (21–22 Oct) uses the current build. The teacher-app restyle lands after it.

## Look
- **Teacher app and landing page: dark.** Blackboard `#172524`, slate `#223633`, lines `#2E4441`, chalk text `#F2EFE6`, muted `#A9B8B3`.
- **Studio and Admin: paper work area with a dark sidebar.** Paper `#F6F4EE`, cards `#FFFEFB`, lines `#E3DFD3`, ink `#172524`, muted `#55625F`.
- **Accents:** marigold `#F4B23E` (the one primary action; ink text on it), leaf `#3FB8A0` (most got it), clay `#E8704A` (few got it). Every colour that carries meaning also has a word next to it.
- **Type:** Bricolage Grotesque (display) and Figtree (text), with Noto Sans Devanagari, Tamil, Oriya and Ol Chiki in the same stack. Sizes in rem; display sizes fluid with `clamp()`. The root font size stays the browser's, so phone text-size settings still apply.
- **Touch:** nothing tappable under 44 px; classroom buttons 56 px.
- **Motion:** 200 ms ease-out; all of it off under `prefers-reduced-motion`.

## Components and structure
- **shadcn on Base UI** (`shadcn init --base base`), components copied into `app/src/components/ui/`: button, badge, card, tabs, dialog, input, select, tooltip, sonner (toasts). Utility deps: `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
- **Theme:** shadcn's CSS variables (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, …) set once per theme: `.theme-board` (dark) and `.theme-paper`. Extra tokens: `--most`, `--some`, `--few`. Defined in `app/src/index.css`.
- **Fonts:** `@fontsource-variable/*` packages for the six families. Each ships per-script `unicode-range` files, so a browser only downloads a script when it appears. The service worker precaches the latin, latin-ext, devanagari, tamil, oriya and ol-chiki files (not cyrillic, greek or vietnamese), so every script works offline after the first visit.
- **`AppShell`** (`app/src/components/AppShell.tsx`): sidebar plus content. The logo button doubles as the collapse toggle (the mark swaps to a sidebar icon on hover and focus, Gemini style). Collapsed: a 76 px icon rail. Below 768 px the sidebar becomes a top bar with a menu sheet. The choice is remembered in `localStorage` (wrapped in try/catch). Used by the Studio and Admin.
- **Logo** (`app/src/components/Logo.tsx` and `app/public/`): mark A, a speaker with two sound waves.
  - `logo.svg`: the marigold tile (app icon source).
  - `favicon.svg`: the transparent mark, cropped to fill the box; ink on light tabs, marigold on dark (`prefers-color-scheme` inside the SVG).
  - `favicon-32.png`, `favicon-16.png`: transparent marigold mark (no colour switching in PNG).
  - `icon-192.png`, `icon-512.png` (`any`), `icon-512-maskable.png` (mark inside the 80 % safe zone), `apple-touch-icon.png` (180): the tile.
  - PNGs are rendered once from the SVGs with `rsvg-convert` and committed; the command is in `app/public/ICONS.md`.

## Screens
1. **Teacher (phone first):** library with today's lesson as a marigold card; player with progress segments, the line now playing, the checkpoint question and three 56 px answer buttons (most/some/few with their branch named), a countdown to the automatic choice, and the analogy button; attendance with a 6-column roll grid. Sync state as a small badge.
2. **Studio:** `AppShell`; list of lessons with status filters in the sidebar; lesson header with grade, district, languages and length; six review scores as chips (low scores outlined in clay); tabs per part (teach, easier, more practice, stretch, analogy, call recap); script beside its back-translation; review flags directly under the line they are about, each with Edit line.
3. **Admin:** `AppShell`; headline numbers with sparklines; donut of checkpoint answers; lessons per day; a Kanban of the lesson pipeline (writing → needs review → approved → voiced & packed → in classrooms) with drag to move; catch-up call funnel; heatmap of "most got it" by classroom and day; the keypad phone simulator and call log on their own pages. Charts with `recharts`, drag with `@dnd-kit/core`: both lazy-loaded with the Admin route only. Data comes from the existing dashboard API; anything it does not provide yet shows as empty, never invented.
4. **Landing page (`/`):** the hero (speaker with pulsing rings and number words in five scripts), the problem in sourced numbers, how it works, measured offline results, "try it" links to the three apps. Its own lazy chunk with `motion` for the animation; the teacher route never loads it. `start_url` stays `/teacher`.

## Testing
- After each phase: `npm run lint`, `tsc -b`, `npm test` and `npm run build` pass.
- Chrome at 360, 390, 768, 1280 and 1920 px: no horizontal scroll, no empty bands, every script renders (check the mixed Hindi/Tamil line from Studio episode 14).
- Lighthouse accessibility ≥ 95 on each route.
- Phase 2 only: repeat the offline run (TESTING_LOG L1–L4) and keep the teacher route's first load within 25 % of 96 KB plus the fonts actually shown.

## Build plan
| Phase | Branch / PR | Contents | Reviewer | When |
|---|---|---|---|---|
| 1 | `feat/ui-foundation` | This spec; deps; shadcn init (base); theme tokens; fonts and precaching; `Logo`, `AppShell`; logo, favicon and app icons; manifest update. No screen changes except fonts (fixes the boxes) and icons | Sanjjith | now |
| 2 | `feat/ui-teacher` | Library, player, attendance, lesson prep restyled | Sanjjith | after 22 Oct |
| 3 | `feat/ui-studio` | Studio in `AppShell` | Harsha | after phase 1 |
| 4 | `feat/ui-admin` | Admin in `AppShell`, charts, Kanban | Cholan / Loktrishal | after phase 3 |
| 5 | `feat/ui-landing` | Landing page at `/` | Harsha | last, before freeze (29 Oct) |
