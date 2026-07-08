# Expected Triage Pack — Checkout Payment Timeout

## Incident

**Primary Jira:** KAN-1  
**Summary:** Checkout payment timeout fixed by retry wrapper  
**Service:** checkout-service  
**Issue Type:** Incident  
**Current Status:** To Do  
**Assignee:** amit khandelwal  
**Reporter:** amit khandelwal  

## Problem Statement

Checkout API was intermittently failing during payment confirmation because payment gateway timeout was not retried correctly.

## Root Cause

Payment gateway timeout was not handled using the standard retry wrapper.

## Resolution

A retry wrapper was added with exponential backoff for timeout errors.

## Developer Fix

The related developer task KAN-5 defines the required implementation:

- Identify the payment confirmation call in checkout-service.
- Retry only timeout errors.
- Do not retry validation or business-rule failures.
- Add structured logging for retry attempts.
- Add unit tests for timeout scenarios.
- Add regression test cove- Add regression test cove- urney.

## Related## Related## Related## Related## Related## Related|--## RelaN-2 | Checkout latency due to downstream payment dependency | Confirms payment provider latency as a recurring dependency issue |
| KAN-3 | Checkout regression after GraphQL payment mutation change | Indicates checkout failures can also be introduced by GraphQL mapping changes |
| KAN-4 | Checkout failure after deployment rollback | Highlights rollback/configuration as another related failure pattern |

## Recommended Triage Actions

1. Confirm whether current failure is timeout-related, GraphQL-mapping-related, or rollback/config-related.
2. Check checkout-service lo2. Check che attempt count and final failure reason.
3. Validate whether timeout errors are retried up to 2 times.
4. Confirm validation failures are n4. Confirm validation faient 4. Confirm validation failures are n4. Confirm vaerif4. Confirm validation failures are n4. Cjourn4. Confirm validation failures are n4.tu4. Confirm validation failures are n4. Confirm validationout payment issue was caused by missing retry handling for downstream payment gateway timeout scenarios. The corrective action is to implement retry handling with exponential backoff only for timeout error4. Confirm validation failures are n4. Confirm validation faient 4. Confirm validation failures are n4. Confirm vaerif4. Confirm validation failurewor4. Confirm validation failures are n4. Confirm validation faient 4. Confirm validation failures are n4. Confirm vaerif4. Coon.
