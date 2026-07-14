#!/usr/bin/env bash
set -euo pipefail

INCIDENT_NUMBER="${1:-INC0010001}"

cd "$(dirname "$0")/.."

if [ ! -f data/ams-traces.json ]; then
  echo "Trace store not found: data/ams-traces.json"
  exit 1
fi

python3 - <<PY
import json
from pathlib import Path

incident = "$INCIDENT_NUMBER"
data = json.loads(Path("data/ams-traces.json").read_text())

records = data.get("records", [])
matches = [r for r in records if r.get("incidentNumber") == incident]

if not matches:
    print(f"No trace found for incident: {incident}")
    raise SystemExit(1)

print(json.dumps(matches[0], indent=2))
PY
