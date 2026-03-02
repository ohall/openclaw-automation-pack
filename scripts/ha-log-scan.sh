#!/usr/bin/env bash
set -euo pipefail

# Minimal log scan helper (intended to be run on HA host via ssh).
# Usage:
#   ssh root@<ha> -p 2222 "ha core logs -n 800" | ./scripts/ha-log-scan.sh

# Actionable-ish patterns. Adjust as needed.
egrep -i "(CRITICAL|ERROR|Setup failed|InvalidToken|Unauthorized|Traceback|Exception)" \
  | tail -n 200
