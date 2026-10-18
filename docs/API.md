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

Episode status: `generating → in_review → approved | rejected`, or `generating → failed` (with `error`). A server restart marks unfinished generations `failed`. The database enforces these rules with check constraints, not just the API.

## Planned
| Method | Path | Role | Purpose | Owner |
|---|---|---|---|---|
| POST | `/episodes/{id}/pack` | admin | Voice + build the signed `.sahpaathi` pack of an approved episode | M3 + M1 |
| GET | `/packs?district_id&grade` · `/packs/{id}` | teacher | List / download packs (HTTP Range for resumable 2G downloads) | M1 |
| POST | `/sync` | teacher | `{events: [{event_id, kind, at, ...}]}` from the player's outbox. Must be **idempotent by `event_id`**: a duplicate gets 2xx, never a 4xx for the whole batch, or the player's queue can never drain | M4 |
| POST | `/ivr/calls/run` · `/ivr/webhook` | admin · provider | Absentee catch-up calls + DTMF 1/2/3 | M4 |
| GET | `/dashboard` | admin | Usage, % "Most got it", catch-up completion | M4 |
