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
| GET | `/episodes/{id}` | reviewer, admin | Summary + `episode` (the contract in EPISODE_SCHEMA.md), `review` (`{model, rubric{scores, issues}, gloss[{line_id, english}]}`), `review_notes`, `reviewed_by` |
| POST | `/episodes/{id}/review` | reviewer, admin | `{decision: "approve" \| "reject", notes}`. Only from `in_review` (else 409); rejecting needs notes (else 422) |
| POST | `/episodes/{id}/pack` | admin | Voice (Sarvam; Santali from the phrase bank) and sign the pack of an **approved** episode → **202** pack summary with `status: "building"`. 404 unknown episode, 409 not approved or a build already running. Takes a few minutes; poll `/packs` |
| GET | `/packs?district_id&grade` | teacher, reviewer, admin | `[{id, episode_id, status, error, size_bytes, title, grade, district_id, created_at}]`, newest first. Teachers see only `ready` packs; reviewers and admins also see `building` and `failed` (with `error`) |
| GET | `/packs/{id}` | teacher, reviewer, admin | The `.sahpaathi` file (`application/octet-stream`). Supports `Range: bytes=a-b`, `a-` and `-n` (206 + `Content-Range`; 416 when outside the file) so a dropped 2G download resumes. 404 unless `ready` |
| POST | `/sync` | open (the player has no login yet) | `{events: [...]}`, at most 200. Each event: `{kind: "tap", event_id, episode_id, segment_id, tap: few\|some\|most, auto, at}` (`at` ISO 8601 with timezone). Always **200** with `{accepted, duplicates, rejected: [{event_id, reason}]}`: duplicates are counted once, and one bad event is reported instead of failing the batch, so the player's queue always drains. 422 only for a malformed body or more than 200 events |

Pack status: `building → ready`, or `building → failed` (with `error`; missing `TTS_API_KEY` or `PACK_SIGNING_KEY` on the server is the usual cause). A restart marks unfinished builds `failed`. The pack file is stored in the `packs` table (under 2 MB each), so it survives Render redeploys without extra storage; move it to R2 if packs outgrow Postgres.

Episode status: `generating → in_review → approved | rejected`, or `generating → failed` (with `error`). A server restart marks unfinished generations `failed`. The database enforces these rules with check constraints, not just the API.

## Planned
| Method | Path | Role | Purpose | Owner |
|---|---|---|---|---|
| POST | `/ivr/calls/run` · `/ivr/webhook` | admin · provider | Absentee catch-up calls + DTMF 1/2/3 | M4 |
| GET | `/dashboard` | admin | Usage, % "Most got it", catch-up completion | M4 |
