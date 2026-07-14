#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "AMS metrics summary:"
echo

curl -sS "$BASE_URL/metrics" \
  | grep -E "ams_triage_|ams_github_|ams_webhook_|ams_trace_records_total|ams_http_requests_total" \
  || true
