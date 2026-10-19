# API

Base path `/api/v1`. JSON, snake_case. Errors: `{"detail": "<teacher-readable message>"}`. Interactive docs: `/docs`.
Auth: `POST /auth/login` returns a JWT (12 h); send `Authorization: Bearer <token>`. Roles: `teacher`, `reviewer`, `admin`.

## Live
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/health` (no prefix) | public | Liveness; the Render health check and keep-warm cron use it |
| POST | `/auth/login` | public | `{email, password}` → `{token, role, name}`; 401 `"Wrong email or password."` |
| GET | `/catalog` | reviewer, admin | `{lessons: [{id, grade, subject, chapter, nipun_lo}], districts: [{id, name, state, home_lang, school_lang}]}` from `content/` |
| POST | `/episodes` | reviewer, admin | `{lesson_id, district_id}` → **202** summary with `status: "generating"`. Generation (Sonnet → tier-1 rules → Haiku review, one repair) runs in the background for a few minutes; poll the list or detail |
| GET | `/episodes` | reviewer, admin | Summaries, newest first: `{id, lesson_id, district_id, status, title, passed, scores{criterion: 1-5}, error, created_at}` |
| GET | `/episodes/{id}` | reviewer, admin | Summary + `episode` (the contract in EPISODE_SCHEMA.md), `review` (`{model, rubric{scores, issues}, gloss[{line_id, english}]}`), `review_notes`, `reviewed_by`, `edits` (`{line_id: {before, by, at}}` or null) |
| PATCH | `/episodes/{id}/lines/{line_id}` | reviewer, admin | `{text}`: correct one line's wording. Only in `in_review` (else 409); 404 unknown line; 422 empty, a Santali line that is not a recorded phrase, or a broken tier-1 rule. The AI's original stays in `edits[line_id].before`; editing back to it removes the entry. Returns the detail |
| POST | `/episodes/{id}/review` | reviewer, admin | `{decision: "approve" \| "reject", notes}`. Only from `in_review` (else 409); rejecting needs notes (else 422) |
| POST | `/episodes/{id}/pack` | admin | Voice (Sarvam; Santali from the phrase bank) and sign the pack of an **approved** episode → **202** pack summary with `status: "building"`. 404 unknown episode, 409 not approved or a build already running. Takes a few minutes; poll `/packs` |
| GET | `/packs?district_id&grade` | teacher, reviewer, admin | `[{id, episode_id, status, error, size_bytes, title, grade, district_id, created_at}]`, newest first. Teachers see only `ready` packs; reviewers and admins also see `building` and `failed` (with `error`) |
| GET | `/packs/{id}` | teacher, reviewer, admin | The `.sahpaathi` file (`application/octet-stream`). Supports `Range: bytes=a-b`, `a-` and `-n` (206 + `Content-Range`; 416 when outside the file) so a dropped 2G download resumes. 404 unless `ready` |
| GET | `/packs/{id}/ivr/{recap\|menu}` | admin | The absentee-call audio built with the pack, Ogg Opus (`audio/ogg`): `recap` is the episode's `ivr_recap` lines, `menu` is the spoken "press 1 to hear it again, 2 if your child understood, 3 if you need help" in the family's language (the school language for Santali families). 404 unless the pack is `ready`. The menu wordings need a native speaker's review |
| POST | `/sync` | open (the player has no login yet) | `{events: [...]}`, at most 200. Each event: `{kind: "tap", event_id, episode_id, segment_id, tap: few\|some\|most, auto, at}` (`at` ISO 8601 with timezone). Or `{kind: "attendance", event_id, classroom_id, episode_id, absent: [roll numbers], at}`: each absent child gets one queued catch-up call (see `/ivr/calls`), once per child and episode however often it is sent. `classroom_id` and roll numbers are opaque codes (letters, digits, hyphen, at most 40), never names or phone numbers; anything else is rejected. Always **200** with `{accepted, duplicates, rejected: [{event_id, reason}]}`: duplicates are counted once, and one bad event is reported instead of failing the batch, so the player's queue always drains. 422 only for a malformed body or more than 200 events |
| GET | `/dashboard` | admin | `{overall, auto_fallbacks, episodes[], last_days[], episodes_by_status, packs_ready, catchup_calls}` from the synced taps. `overall` and each episode carry `{taps, most, some, few, pct_most, pct_some, pct_few}` over **deliberate** taps (percentages are `null` until there is one); taps where nobody pressed and the 10 s fallback chose Core are counted apart as `auto_fallbacks`. `last_days` is the last 14 days (UTC) of taps, zeros included. `catchup_calls` is `{total, queued, in_progress, completed, no_response, understood, help, pct_answered}`: `completed` calls are those where a parent pressed 2 or 3, and `pct_answered` is completed of the finished calls (`null` until one has finished) |
| GET | `/ivr/calls` | admin | Absentee catch-up calls, newest first: `{id, classroom_id, student_ref, episode_slug, status, outcome, plays, created_at}`. `status`: `queued → in_progress → completed` (parent pressed 2 or 3) or `no_response`; `outcome`: `understood` or `help` |
| POST | `/ivr/calls` | admin | `{classroom_id, student_ref, episode_slug}` queues the call for one absent child. The ids are opaque codes (letters, digits, hyphen, at most 40), never names or phone numbers (422 otherwise). Asking again for the same child and episode returns the existing call |
| POST | `/ivr/calls/{id}/start` | admin | Begins the call: `{play: [{name, url}], gather, hangup, status, outcome}`. Plays the recap, then the menu, and waits for a key. 409 unless queued, or when the episode has no ready pack with call audio. `url` is `/packs/{id}/ivr/{name}` |
| POST | `/ivr/calls/{id}/press` | admin | `{digit: "0"-"9"\|"*"\|"#"\|null}` (null: nothing pressed in time) returns the next step. **1** hears it again (3 times at most), **2** child understood, **3** needs help; a missed or wrong key repeats the menu once, then the call ends with `no_response`. 409 unless in progress |

The call logic lives in `backend/app/ivr/flow.py` and does not depend on who carries the call: the Admin keypad simulator drives it today, a telephony provider's webhook will drive the same `start` and `press` later. No names or phone numbers are stored; dialling a real phone needs a separate consented contact list.

Pack status: `building → ready`, or `building → failed` (with `error`; missing `TTS_API_KEY` or `PACK_SIGNING_KEY` on the server is the usual cause). A restart marks unfinished builds `failed`. The pack file is stored in the `packs` table (under 2 MB each), so it survives Render redeploys without extra storage; move it to R2 if packs outgrow Postgres.

Episode status: `generating → in_review → approved | rejected`, or `generating → failed` (with `error`). A server restart marks unfinished generations `failed`. The database enforces these rules with check constraints, not just the API.

## Planned
| Method | Path | Role | Purpose | Owner |
|---|---|---|---|---|
