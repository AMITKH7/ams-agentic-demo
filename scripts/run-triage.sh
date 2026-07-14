#!/usr/bin/env bash
set -euo pipefail

INCIDENT_NUMBER="${1:-INC0010001}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

cd "$(dirname "$0")/.."

set -a
source .env
set +a

echo "Running AMS triage for incident: $INCIDENT_NUMBER"

curl -sS -X POST "$BASE_URL/api/v1/incident/triage" \
  -H "Content-Type: application/json" \
  -H "x-ams-internal-key: $BRIDGE_INTERNAL_KEY" \
  -d "{
    \"incidentNumber\": \"$INCIDENT_NUMBER\"
  }" \
  | tee "samples/latest-script-triage-response.json" \
  | python3 -m json.tool
