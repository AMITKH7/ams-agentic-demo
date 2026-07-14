#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Open AMS local dashboard:"
echo "$BASE_URL/dashboard"

echo
echo "Other observability endpoints:"
echo "$BASE_URL/health"
echo "$BASE_URL/live"
echo "$BASE_URL/ready"
echo "$BASE_URL/metrics"
