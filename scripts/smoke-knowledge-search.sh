#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
source .env
set +a

echo "Calling AMS bridge knowledge search..."

curl -s -X POST http://localhost:3000/api/v1/knowledge/search \
  -H "Content-Type: application/json" \
  -H "x-ams-internal-key: $BRIDGE_INTERNAL_KEY" \
  -d '{
    "incidentNumber": "INC-DEMO-001",
    "shortDescription": "Checkout payment timeout during payment confirmation",
    "ciName": "checkout-service",
    "jiraIssueKey": "KAN-1"
  }' \
  | tee samples/latest-knowledge-response.json \
  | python3 -m json.tool

python3 - <<'PY'
import json
from pathlib import Path

response_path = Path("samples/latest-knowledge-response.json")
triage_path = Path("samples/latest-triage-pack.md")

data = json.loads(response_path.read_text())
triage_pack = data.get("triagePack", "")

triage_path.write_text(triage_pack)

print("")
print(f"Triage pack saved to: {triage_path}")
PY
