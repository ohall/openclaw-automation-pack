# OpenClaw Automation Pack

A small, pragmatic toolkit for running a household-grade OpenClaw + Home Assistant setup:

- **Daily health checks** (Core/add-on/HACS update detection + log scanning)
- **HACS updater** via Home Assistant API (LLAT)
- **Hubitat cleanup helpers** (disable orphan entities)

This repo is meant to grow over time with small, real improvements.

## Contents

- `scripts/ha-hacs-update.mjs` — trigger updates for `update.*` entities and restart HA Core
- `scripts/ha-scan-update-entities.mjs` — scan for update entities and report pending updates (JSON)
- `scripts/ha-disable-orphans.mjs` — disable entity-registry entries no longer exported by Hubitat Maker API
- `scripts/ha-log-scan.sh` — extract actionable errors from HA logs

## Setup

Create a credentials file on the machine running these scripts:

- `~/.openclaw/credentials/homeassistant-api.env`

You can also place a `.env` file in the current working directory; it will be used if the default file is missing.

```bash
HA_BASE_URL=http://homeassistant.local:8123
HA_LONG_LIVED_ACCESS_TOKEN=...
```

Optional (for Hubitat orphan detection):

```bash
HUBITAT_MAKER_API_BASE_URL=http://<hub-ip>/apps/api/<appId>
HUBITAT_MAKER_API_ACCESS_TOKEN=...
```

## Safety

These scripts:
- do **not** commit secrets
- default to **dry-run** where appropriate

## Exit Codes

All scripts follow consistent exit codes as defined in [CONTRIBUTING.md](CONTRIBUTING.md#exit-codes):

| Code | Meaning | Usage |
|------|---------|-------|
| 0 | Success | Script completed successfully |
| 1 | General error | Unspecified failure |
| 2 | Invalid arguments | Missing or incorrect command-line arguments |
| 3 | Configuration error | Missing env vars, invalid credentials |
| 4 | API/network error | HA API unreachable or returned error |
| 5 | Operation failed | Specific operation (rename, update, etc.) failed |
| 6 | Dry-run mode | Script ran in dry-run mode (successful preview) |

## License

MIT

## Example Usage

```bash
# Run HACS update
node scripts/ha-hacs-update.mjs

# Scan for pending updates
node scripts/ha-scan-update-entities.mjs

# Scan with verbose output
node scripts/ha-scan-update-entities.mjs --verbose

# Filter JSON output with jq
node scripts/ha-scan-update-entities.mjs | jq '.entities[] | select(.state == "on")'
```
