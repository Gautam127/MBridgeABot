---
title: 'Story 1.2: Telegram Update Idempotency Filter'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Telegram re-delivers webhook/polling updates during temporary connection interruptions, which could cause duplicate execution of expensive or mutating workstation commands.
**Approach:** Implement an in-memory bounded LRU cache (1,000 entries) middleware that tracks `update_id`s and drops duplicates silently.

## Boundaries & Constraints

**Always:**
- Track `update_id` in a bounded in-memory LRU cache with a maximum capacity of 1,000 entries.
- Drop duplicates immediately before reaching command handlers.
- Log a `DEBUG` event when a duplicate `update_id` is detected and dropped.

**Never:**
- Allow a duplicated `update_id` to execute downstream handlers during the same process lifetime.
- Exceed the 1,000 entry LRU cache bound to prevent memory leakage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh Update ID | `update_id: 101` not in LRU cache | Stored in cache, update proceeds downstream | N/A |
| Duplicate Update ID | `update_id: 101` already in LRU cache | Update dropped immediately, no handler executed | Log `DEBUG` message |
| Cache Capacity Exceeded | 1,001st unique update arrives | Oldest entry evicted, new `update_id` stored | Standard LRU eviction |

</frozen-after-approval>

## Code Map

- `src/bot/middleware/idempotency.ts` -- LRU cache update filter middleware
- `src/bot/bot.ts` -- Register idempotency middleware after allowlist middleware
- `tests/idempotency.test.ts` -- Unit test cache insertion, deduplication, and eviction

## Tasks & Acceptance

**Execution:**
- [ ] `src/bot/middleware/idempotency.ts` -- Implement LRU cache (capacity 1,000) for `update_id` deduplication
- [ ] `src/bot/bot.ts` -- Chain idempotency middleware after allowlist middleware
- [ ] `tests/idempotency.test.ts` -- Unit tests validating first-time pass and duplicate drop

**Acceptance Criteria:**
- Given an in-memory bounded LRU cache initialized with a capacity of 1,000 entries, when a Telegram update arrives with an `update_id` that has not been seen during the current process lifetime, then the `update_id` is recorded in the cache, and the update is passed to downstream handlers.
- Given a Telegram update arrives with an `update_id` already present in the LRU cache, when the idempotency middleware evaluates the update, then the update is dropped immediately without executing downstream handlers, and a `DEBUG` log event is recorded noting the duplicate `update_id` was ignored.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
