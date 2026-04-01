# TODO (small, real improvements)

Pick one small item per run; keep commits focused.

TODO (small, real improvements)
Pick one small item per run; keep commits focused.

## Backlog
✅ Add scripts/ha-entity-rename.mjs helper for safe entity_id renames (API) with backup/export.
✅ Add scripts/ha-restart-and-wait.mjs utility (restart core, wait for /api/ to respond).
✅ Improve ha-hacs-update.mjs: optional auto-restart, optional wait-for-healthy, better reporting.
✅ Add scripts/ha-scan-update-entities.mjs to list pending updates (JSON report).
Add GitHub Actions: node --check + basic unit tests.
✅ Add basic tests for _env.mjs parsing.
Add docs: "How to create HA LLAT" and "Safety/rollback".
Add scripts/ha-disable-orphans.mjs dry-run mode and allowlist/denylist.
✅ Add support for .env format in addition to homeassistant-api.env.
✅ Add a Makefile for common commands.

Add scripts/ha-backup-config.mjs to export critical YAML/files before mutating actions.
Add scripts/ha-validate-config.mjs wrapper for config check before restart.
Add --dry-run support consistently across all mutating scripts.
Add --json output mode consistently across all scripts.
Add shared logger/util for consistent timestamps, status labels, and stderr handling.
Add basic retry/backoff for transient HA API failures.
Add explicit confirmation flag for destructive operations (--yes / --force).
Add scripts/ha-list-areas-devices.mjs for quick inventory/reporting.
Add scripts/ha-find-duplicate-friendly-names.mjs to catch naming collisions.
Add scripts/ha-unused-helpers-report.mjs to identify stale helpers/entities.
Add tests for argument parsing and failure paths in core scripts.
Add CI check for formatting/linting.
Add CONTRIBUTING.md with script conventions and safety rules.

## Housekeeping
Standardize script output and exit codes.
Ensure scripts never print secrets.
Document exit code meanings in README.
Centralize env loading and validation in one shared helper.
Normalize error messages to include action, target, and suggested rollback.
