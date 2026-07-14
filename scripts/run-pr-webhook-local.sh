#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

cd "$(dirname "$0")/.."

echo "Replaying local GitHub PR webhook for Copilot PR #4"

curl -sS -X POST "$BASE_URL/api/v1/github/webhook" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: local-script-pr4-test" \
  -d '{
    "action": "opened",
    "repository": {
      "full_name": "AMITKH7/checkout-service"
    },
    "pull_request": {
      "number": 4,
      "html_url": "https://github.com/AMITKH7/checkout-service/pull/4",
      "state": "open",
      "draft": true,
      "merged": false,
      "title": "Retry transient payment gateway timeouts in checkout confirmation (INC0010001 / KAN-1)",
      "body": "Related to ServiceNow Incident INC0010001 and GitHub Issue #3.",
      "head": {
        "ref": "copilot/kan-1-checkout-payment-timeout-fix"
      }
    }
  }' \
  | tee "samples/latest-script-pr-webhook-response.json" \
  | python3 -m json.tool
