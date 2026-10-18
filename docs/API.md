# API (owner: M4)

Base: `/api/v1`. JSON, snake_case. Errors: `{"detail": "..."}`. Auth: bearer JWT; roles `teacher`, `reviewer`, `admin`.
This is the planned surface. M4 fills in request/response shapes as endpoints land; the interactive docs are at `/docs`.

| Method | Path | Role | Purpose | Owner |
|---|---|---|---|---|
| GET | `/health` | public | Liveness (used by the keep-warm cron) | M4 |
| POST | `/auth/login` | public | Returns JWT + role | M4 |
| POST | `/episodes/generate` | reviewer, admin | Start generation (background); body: grade, subject, nipun_lo, chapter_id, district_id | M1 |
| GET | `/episodes` · `/episodes/{id}` | reviewer, admin | List / detail with guardrail scores and status (`generating · failed · in_review · approved · packed`) | M1 |
| POST | `/episodes/{id}/review` | reviewer | Approve / reject with notes; edits to lines allowed | M1 |
| POST | `/episodes/{id}/pack` | admin | Voice + build the signed `.sahpaathi` pack | M3 |
| GET | `/packs?district_id&grade` · `/packs/{id}` | teacher | List packs; download (supports HTTP Range for resumable 2G downloads) | M4 |
| POST | `/sync` | teacher | Batch upload of queued taps + attendance; idempotent by client event id | M4 |
| POST | `/ivr/calls/run` | admin | Place queued catch-up calls | M4 |
| POST | `/ivr/webhook` | provider | Call flow + DTMF 1/2/3 | M4 |
| GET | `/dashboard` | admin | Usage, % "Most got it", catch-up completion | M4 |
