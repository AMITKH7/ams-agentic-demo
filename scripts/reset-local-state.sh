#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p data

cat > data/ams-traces.json <<'JSON'
{
  "version": 1,
  "records": [
    {
      "incidentNumber": "INC0010001",
      "incidentSysId": "73e3bd882fcacb1020e3308a6fa4e34a",
      "traceId": "AMS-HANDOFF-INC0010001-seeded",
      "ciName": "checkout-service",
      "selectedJira": "KAN-1",
      "githubIssue": {
        "number": 3,
        "html_url": "https://github.com/AMITKH7/checkout-service/issues/3",
        "api_url": "https://api.github.com/repos/AMITKH7/checkout-service/issues/3",
        "title": "AMS Handoff - INC0010001 - Checkout payment timeout during payment confirmation"
      },
      "githubPr": {
        "number": 4,
        "html_url": "https://github.com/AMITKH7/checkout-service/pull/4",
        "state": "open",
        "draft": true,
        "branch": "copilot/kan-1-checkout-payment-timeout-fix"
      },
      "status": "PR_CREATED",
      "createdAt": "2026-07-12T00:00:00.000Z",
      "updatedAt": "2026-07-12T00:00:00.000Z",
      "events": [
        {
          "timestamp": "2026-07-12T00:00:00.000Z",
          "traceId": "AMS-HANDOFF-INC0010001-seeded",
          "action": "TRACE_SEEDED_FROM_EXISTING_DEMO",
          "status": "success",
          "message": "Seeded clean demo chain: INC0010001 -> GitHub Issue #3 -> Copilot PR #4."
        }
      ]
    }
  ]
}
JSON

echo "Local AMS trace state reset to clean demo chain:"
echo "- ServiceNow Incident: INC0010001"
echo "- GitHub Issue: https://github.com/AMITKH7/checkout-service/issues/3"
echo "- Copilot PR: https://github.com/AMITKH7/checkout-service/pull/4"
echo
echo "Note: This does not delete ServiceNow work notes, GitHub issues, or PRs."
