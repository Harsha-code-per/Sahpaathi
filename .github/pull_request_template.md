## What
<!-- One or two lines. -->

## Why
<!-- A TESTING_LOG.md finding, a bug, or a roadmap item. -->

## How to test
<!-- Exact steps, curl, or page to open. Say if it needs airplane mode or the real speaker. -->

## Checklist ([AGENTS.md](../AGENTS.md))
This PR merges itself when CI is green. Open it as a draft, or add `hold`, if it must wait.
- [ ] **Problem:** helps the teacher or child; the classroom path still works offline; no claim that isn't true
- [ ] **Quality:** small and focused, reuses existing helpers, formatted (`ruff format`, `npm run format`)
- [ ] **Security:** no secrets or personal data; anything paid or public is capped and validated
- [ ] **Testing:** a test that fails if this breaks; a bug fix includes its regression test
- [ ] **Efficiency:** nothing new in the offline bundle unless the classroom needs it; no unbounded queries
- [ ] **Accessibility:** labels, focus, 44 px targets, reduced motion; loading, error and empty states (no white screen)
- [ ] Only touches paths I own (`.github/CODEOWNERS`), or the owner is tagged
- [ ] Screenshot at phone width for UI changes
