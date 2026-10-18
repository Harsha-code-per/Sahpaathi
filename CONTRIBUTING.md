# Contributing

Four people, 14 days, one `main`. These rules exist so nobody spends 31 October resolving merge conflicts.

## 1. Golden rules
1. **Edit only files you own** ([.github/CODEOWNERS](.github/CODEOWNERS), [ownership map](docs/TEAM_PLAN.md#ownership)). Touching someone else's file? Tag them in the PR.
2. **Never commit to `main` directly.** Branch, PR, merge.
3. **Rebase often** (at least twice a day) and push small PRs early.
4. **The episode contract is frozen from end of Day 2** (Tue 20 Oct). Changing it means one PR that updates `backend/app/factory/schema.py`, `app/src/lib/types.ts` and `docs/EPISODE_SCHEMA.md` together, announced in the team chat.
5. **The teacher player must work in airplane mode.** Anything on the classroom path that needs the network is a bug.
6. **Commit from your own GitHub account.** Judges look at who did what.
7. **No commits after we submit** (target Sat 31 Oct 18:00 IST; hard deadline Sun 1 Nov 23:59 IST). Evaluation runs on the frozen state.

## 2. Branches

| Member | Branch prefix | Example |
|---|---|---|
| M1 Harshavardhan | `feat/factory-*`, `feat/studio-*` | `feat/factory-guardrails` |
| M2 Sanjjith | `feat/player-*` | `feat/player-checkpoints` |
| M3 Loktrishal | `feat/voice-*`, `feat/sensing-*` | `feat/voice-santali-splicer` |
| M4 Cholan | `feat/api-*`, `feat/ivr-*`, `feat/admin-*` | `feat/ivr-catchup` |

One branch per feature, merged within a day.

## 3. Daily loop

```bash
git switch main && git pull
git switch -c feat/<name>

# ... work, commit small and often ...
git add <your files>            # check `git status` first; never blindly `git add -A`
git commit -m "feat(player): add 10 s auto-fallback to core"

git fetch origin
git rebase origin/main          # rare conflicts if you stay in your files
git push --force-with-lease     # safe force-push of your own branch

# open PR → CI green → owner/teammate approves → "Rebase and merge"
```

**Never "Squash and merge".** It collapses your commits into one authored by whoever clicks the button and erases per-member history.
Rebase gone wrong? `git rebase --abort` and ask. Never force-push `main`.

## 4. Commit messages ([Conventional Commits](https://www.conventionalcommits.org/))

`<type>(<scope>): <imperative summary, ≤ 72 chars>`

Types: `feat` `fix` `refactor` `test` `docs` `style` `chore` `ci`.
Scopes: `factory` `guardrails` `studio` `content` `player` `pwa` `sync` `voice` `pack` `sensing` `api` `db` `auth` `ivr` `admin` `deploy`.

## 5. Pull requests
- Fill in the PR template. Keep it under ~300 changed lines.
- UI PRs include a screenshot (phone width).
- Review within a couple of hours when tagged. "LGTM + ran it" beats a perfect review on Day 13.
- CI (lint + tests + build) must be green.

## 6. Code style
**Python (backend):** 3.12, type hints, `ruff check . && ruff format .`. Every guardrail, pack and IVR function that can be wrong has a pytest.

**TypeScript (app):** strict TS, `npm run lint` (oxlint). Components `PascalCase.tsx`. Episode types come only from `src/lib/types.ts`. Colours come from the Tailwind theme tokens in `src/index.css` (`ink`, `sun`, `leaf`, `clay`). Big tap targets (≥ 56 px): teachers tap mid-lesson.

## 7. Dependencies
Need a new one? Ask the file owner (M4 for `backend/requirements.txt`, M2 for `app/package.json`). They add it in a tiny separate PR, so lockfile conflicts never happen in feature branches.

## 8. Database changes
Only **M4** changes models or writes Alembic migrations (avoids "multiple heads"). Need a column? Ask M4.

## 9. Secrets and people's data
- Never commit `.env`, keys or tokens. Each service has its own `.env.example` (`backend/`, `app/`); copy it to `.env` in the same folder. Anything in `app/.env` ends up in the public JS bundle, so secrets only ever go in `backend/.env`. If a secret leaks, tell the team, rotate it, then remove it.
- **Never commit real children's or teachers' names, phone numbers, photos or voice recordings.** Field-test notes in `docs/TESTING_LOG.md` use roles only ("Grade 2 teacher, Tamil-medium school"). Santali seed recordings go into `content/voices/` only with the speaker's written consent.
