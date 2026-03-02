# TODO (small, real improvements)

Pick one small item per run; keep commits focused.

## Backlog

- Add `scripts/ha-entity-rename.mjs` helper for safe entity_id renames (API) with backup/export.
- Add `scripts/ha-restart-and-wait.mjs` utility (restart core, wait for /api/ to respond).
- Improve `ha-hacs-update.mjs`: optional auto-restart, optional wait-for-healthy, better reporting.
- Add `scripts/ha-scan-update-entities.mjs` to list pending updates (JSON report).
- Add GitHub Actions: `node --check` + basic unit tests.
- Add basic tests for `_env.mjs` parsing.
- Add docs: "How to create HA LLAT" and "Safety/rollback".
- Add `scripts/ha-disable-orphans.mjs` dry-run mode and allowlist/denylist.
- Add support for `.env` format in addition to `homeassistant-api.env`.
- Add a `Makefile` for common commands.

## Housekeeping

- Standardize script output and exit codes.
- Ensure scripts never print secrets.
