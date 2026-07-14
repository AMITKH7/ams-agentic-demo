#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "== AMS Bridge Health =="
curl -sS "$BASE_URL/health" | python3 -m json.tool

echo
echo "== AMS Bridge Liveness =="
curl -sS "$BASE_URL/live" | python3 -m json.tool

echo
echo "== AMS Bridge Readiness =="
curl -sS "$BASE_URL/ready" | python3 -m json.tool
