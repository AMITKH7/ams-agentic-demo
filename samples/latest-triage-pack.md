# AMS Triage Pack — Checkout payment timeout fixed by retry wrapper

## Incident Snapshot

| Field | Value |
|---|---|
| Service / CI | checkout-service |
| Primary Jira | KAN-1 |
| Issue Type | Incident |
| Status | To Do |
| Assignee | amit khandelwal |
| Reporter | amit khandelwal |
| Created At | 2026-06-24T11:10:25.010Z |
| Resolved At | Not resolved |
| Jira URL | https://amitkh.atlassian.net/browse/KAN-1 |

## Problem Statement

Checkout API was intermittently failing during payment confirmation because payment gateway timeout was not retried correctly.

## Root Cause

Payment gateway timeout was not handled using the standard retry wrapper.

## Resolution / Current Fix

Retry wrapper was added with exponential backoff for timeout errors.

## Developer Fix

Updated PaymentClient retry handling and added unit tests for timeout scenarios.

## Related Work Discovered by Teamwork Graph

Teamwork Graph returned 5 hydrated Jira objects, including 4 related work item(s).

| Key | Type | Status | Summary | Relevance |
|---|---|---|---|---|
| KAN-5 | Task | To Do | Developer fix - Add retry handling for checkout payment timeout | Relevant to payment timeout and retry handling. |
| KAN-2 | Incident | To Do | Checkout latency due to downstream payment dependency | Relevant to payment timeout and retry handling. |
| KAN-3 | Incident | To Do | Checkout regression after GraphQL payment mutation change | Relevant to GraphQL payment mutation regression. |
| KAN-4 | Incident | To Do | Checkout failure after deployment rollback | Relevant to payment timeout and retry handling. |

## Recommended Triage Actions

1. Confirm whether the current failure pattern is timeout-related, GraphQL-mapping-related, downstream-latency-related, or rollback/configuration-related.
2. Check checkout-service logs for payment confirmation timeout errors and retry attempt counts.
3. Validate that timeout errors are retried with exponential backoff.
4. Confirm validation failures and business-rule failures are not retried.
5. Review related Jira work items before creating duplicate fixes.
6. Confirm Jira status reflects the real delivery state.
7. If code remediation is required, hand off this triage pack to GitHub Copilot through a GitHub issue.

## Suggested RCA Summary

The available Jira context indicates a checkout payment timeout pattern linked to missing or insufficient retry handling around the downstream payment gateway. The recommended corrective action is retry handling with exponential backoff for timeout errors, supported by structured logging and regression coverage.

## Demo Proof

This triage pack was generated from Atlassian Rovo MCP using:

- getTeamworkGraphContext
- getTeamworkGraphObject

No direct Jira REST API was used.
