# API (owner: M4)

Base: `/api/v1`. JSON, snake_case. Errors: `{"detail": "..."}`. Auth: bearer JWT; roles `teacher`, `reviewer`, `admin`.
This is the planned surface. M4 fills in request/response shapes as endpoints land; the interactive docs are at `/docs`.

| Method | Path | Role | Purpose | Owner |
|---|---|---|---|---|
| GET | `/health` | public | Liveness (used by the keep-warm cron) | M4 |
| GET | `/ready` | public | Readiness probe (checks PostgreSQL database connectivity) | M4 |
| POST | `/api/v1/auth/login` | public | Returns JWT + role | M4 |
| POST | `/api/v1/episodes/generate` | reviewer, admin | Start generation (background); body: grade, subject, nipun_lo, chapter_id, district_id | M1 |
| GET | `/api/v1/episodes` · `/episodes/{id}` | reviewer, admin | List / detail with guardrail scores and status (`generating · failed · in_review · approved · packed`) | M1 |
| POST | `/api/v1/episodes/{id}/review` | reviewer | Approve / reject with notes; edits to lines allowed | M1 |
| POST | `/api/v1/episodes/{id}/pack` | admin | Voice + build the signed `.sahpaathi` pack | M3 |
| GET | `/api/v1/packs?district_id&grade` · `/packs/{id}` | teacher | List packs; download (supports HTTP Range for resumable 2G downloads) | M4 |
| POST | `/api/v1/sync` | teacher | Batch upload of queued taps + attendance; idempotent by client event id | M4 |
| POST | `/api/v1/ivr/calls/run` | admin | Place queued catch-up calls | M4 |
| POST | `/api/v1/ivr/webhook` | provider | Call flow + DTMF 1/2/3 | M4 |
| GET | `/api/v1/dashboard` | admin | Usage, % "Most got it", catch-up completion | M4 |

## Authentication & Authorization

All authenticated endpoints require an HTTP `Authorization` header with a Bearer JWT:
```http
Authorization: Bearer <access_token>
```

### POST `/api/v1/auth/login`

Authenticates a user and issues an access token. Supports JSON payloads (`application/json`) as well as OAuth2 password forms (`application/x-www-form-urlencoded`).

**Request (JSON):**
```json
{
  "email": "teacher@sahpaathi.org",
  "password": "<plain_text_password>"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "role": "teacher",
  "expires_in": 86400
}
```

**Errors:**
- `401 Unauthorized`: `{"detail": "Incorrect email or password"}` (generic error to prevent user enumeration).
- `400 Bad Request`: `{"detail": "Invalid JSON payload"}` or invalid form data.

### Token Expiry & Security
- **Algorithm:** `HS256` (strictly enforced during decoding).
- **Default Expiration:** 24 hours (configurable via `JWT_EXPIRE_MINUTES`).
- **Production Guard:** Startup validation requires `JWT_SECRET` to be set to a secure secret of at least 32 characters in production environments (`ENVIRONMENT=production`).

### Role-Based Access Control (RBAC)
FastAPI route dependencies enforce role authorization:
- `get_current_user`: Resolves authenticated `User` ORM instance from Bearer token.
- `require_role(["teacher", "reviewer", "admin"])`: Verifies current user role against allowed list; returns `403 Forbidden` (`{"detail": "Operation not permitted for current role"}`) on mismatch.

## Development Test Account Seeding

To populate initial development accounts with Argon2-hashed passwords:

```bash
cd backend
# With a shared development password:
SEED_PASSWORD="<choose_dev_password>" python -m app.seed

# Or with role-specific passwords:
SEED_TEACHER_PASSWORD="<pw1>" SEED_REVIEWER_PASSWORD="<pw2>" SEED_ADMIN_PASSWORD="<pw3>" python -m app.seed
```

**Seeded Accounts:**
- `teacher@sahpaathi.org` (Role: `teacher`)
- `reviewer@sahpaathi.org` (Role: `reviewer`)
- `admin@sahpaathi.org` (Role: `admin`)

The seeder is strictly idempotent: existing accounts are detected and skipped without password overwrite. It refuses to run in production environments (`ENVIRONMENT=production`).
