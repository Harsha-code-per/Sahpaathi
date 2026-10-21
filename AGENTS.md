# Working on Sahpaathi

Read this before you change anything, whether you are a teammate or an AI assistant. It is the bar every pull request is held to. Process (branches, commits, ownership) is in [CONTRIBUTING.md](CONTRIBUTING.md).

**What we are building:** an offline audio co-teacher for India's one-teacher, many-grade classrooms. A phone plays a lively lesson in the children's home language through a ₹500 speaker; the teacher taps how the class did and the lesson adapts, with no internet in the room. Studio (reviewers), Admin (block officers) and the online AI teacher serve that classroom. When a choice is unclear, pick what helps that teacher, on that phone, with no signal.

## How a change reaches the live site
A PR into `main` **merges itself** once CI is green (`.github/workflows/auto-merge.yml`), and every merge **deploys** the app (Vercel) and the API (Render). There is no human gate, so CI is the gate. Open the PR as a **draft**, or add the **`hold`** label, if it must not merge yet (a migration, a risky change, anything needing a decision).

## The six things we are judged on, as rules

### 1. Problem alignment
- The classroom path works in **airplane mode**. Anything on it that needs the network is a bug.
- Write for a tired teacher mid-lesson: big targets, one obvious action, plain words in her language.
- Never claim what isn't true in copy, the deck or docs (for example, Santali is not voiced yet). Label sample data as sample.

### 2. Code quality
- Read the code you're changing and reuse what's there (`studio/view.ts` `badge()`, `lib/utils.ts` `uuid()` and `lazyPage()`, `components/Waking.tsx`, `app/usage.py` `spend()`) before writing new helpers.
- Small PRs (about 300 changed lines), one concern each. Match the surrounding style and comment density.
- Theme tokens from `app/src/index.css`, not hex colours. `rem` units. Episode types only from `app/src/lib/types.ts`.
- Formatting is automatic: `ruff format` (backend), `npm run format` (app). CI fails on unformatted code.

### 3. Security
- No secrets in git or in `app/.env` (it ends up in the public bundle). Secrets go in `backend/.env` and the Render/Vercel settings.
- No real children's or teachers' names, phone numbers, photos or recordings. Classrooms and children are opaque codes.
- Anything open to the public or costing money (Claude, Sarvam, Exotel) is capped through `app/usage.py`. New paid endpoint means a new cap and a test that it returns 429.
- Validate at the trust boundary (Pydantic models with patterns and limits). The `demo-` prefix is reserved for sample data.
- Never point tests at a real database (`tests/conftest.py` refuses). Never weaken auth to make a demo easier.

### 4. Testing
- Any branch, loop, parser, money, auth or data path gets a test that fails if it breaks: pytest (backend), vitest (app).
- A bug fix comes with the test that would have caught it.
- The browser smoke test (`app/e2e`) opens every page and fails on a white screen, a console error, or a serious accessibility violation. Keep it green; extend it when you add a page or flow.
- Run before pushing: backend `ruff check . && ruff format --check . && pytest -q`; app `npm run lint && npm run format:check && npx tsc -b && npm test && npm run build`.

### 5. Efficiency
- The classroom phone is a ₹7,000 Android on 2G. Keep the offline bundle small; anything desk-only (Studio, Admin, Tutor, the landing 3D) loads lazily and stays out of the service-worker precache (`vite.config.ts` `globIgnores`).
- No unbounded queries or request bodies; paginate or cap. Note deliberate shortcuts with a `ponytail:` comment naming the limit.

### 6. Accessibility
- Every control has a visible label or `aria-label`; icons are `aria-hidden`; status changes use `role="status"` or `role="alert"`.
- Touch targets at least 44 px (56 px on the teacher player). Visible focus rings. Text contrast at least 4.5:1.
- Respect `prefers-reduced-motion`. Information is never in colour alone, or in a tooltip alone.
- Lint enforces `jsx-a11y`; the smoke test runs axe on every page.

## Never ship a white screen
- Every async UI has a **loading**, an **error** (with a way to retry) and an **empty** state. The API sleeps on the free tier: show `<Waking />` while waiting.
- Effects use braces: `useEffect(() => { el.scrollIntoView() }, [])`. An arrow that returns a value hands React a "cleanup" (in Chrome, `scrollIntoView` returns a Promise), and that crashes the page.
- Never index a lookup table with API data without a fallback (`badge(STATUS, s)`, `?? []`).
- New lazy pages use `lazyPage()`, so a deploy never strands an open tab.
