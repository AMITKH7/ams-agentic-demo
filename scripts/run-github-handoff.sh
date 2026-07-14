#!/usr/bin/env bash
set -euo pipefail

INCIDENT_NUMBER="${1:-INC0010001}"
APPROVED_BY="${2:-amit.khandelwal}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

cd "$(dirname "$0")/.."

set -a
source .env
set +a

echo "Running GitHub/Copilot handoff"
echo "Incident: $INCIDENT_NUMBER"
echo "Approved by: $APPROVED_BY"

curl -sS -X POST "$BASE_URL/api/v1/remediation/handoff" \
  -H "Content-Type: application/json" \
  -H "x-ams-internal-key: $BRIDGE_INTERNAL_KEY" \
  -d "{
    \"incidentNumber\": \"$INCIDENT_NUMBER\",
    \"approvedBy\": \"$APPROVED_BY\"
  }" \
  | tee "samples/latest-script-github-handoff-response.json" \
  | python3 -m json.tool
