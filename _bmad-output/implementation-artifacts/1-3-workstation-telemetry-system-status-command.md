---
title: 'Story 1.3: Workstation Telemetry & System Status Command'
type: 'feature'
created: '2026-09-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6223379bad79e6fc279e108422679f35fafd1be3'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When away from the desk, a developer needs to quickly verify that MBridge is active and inspect the workstation host vitals (uptime, memory, OS) without opening remote desktop or SSH sessions.
**Approach:** Implement `/status` command handler returning formatted host telemetry within 2.0s with contextual next-step hints.

## Boundaries & Constraints

**Always:**
- Reply within 2.0 seconds with Markdown-formatted telemetry.
- Include bot uptime, host platform/OS release, Node version, free/total memory in GB, and mounted project count.
- Append a textual next-action hint (e.g. `Next: /projects`).

**Never:**
- Expose workstation environment secrets or sensitive path names in telemetry.
- Block the event loop while querying system metrics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authorized `/status` Query | Authorized user sends `/status` | Formatted Markdown message with uptime, RAM, Node version, project count | N/A |
| High Load / Low Memory | Memory query during heavy execution | Accurately reports available RAM in GB | Fallback to rounded estimates if needed |

</frozen-after-approval>

## Code Map

- `src/core/telemetry.ts` -- Helper functions collecting `os` and `process` metrics
- `src/bot/handlers/status.ts` -- `/status` command handler
- `src/bot/bot.ts` -- Register `/status` command
- `tests/status.test.ts` -- Unit tests for formatting and metric calculations

## Tasks & Acceptance

**Execution:**
- [x] `backend/src/core/telemetry.ts` -- Implement system vitals collector (uptime, OS, RAM, Node version)
- [x] `backend/src/bot/handlers/status.ts` -- Implement `/status` command handler with formatted output and next-action hint
- [x] `backend/src/bot/bot.ts` -- Wire `/status` handler into bot
- [x] `backend/tests/status.test.ts` -- Test output formatting and telemetry values

**Acceptance Criteria:**
- Given an authorized user messages the bot, when the user sends `/status`, then MBridge replies within 2.0s with a clean, Markdown-formatted telemetry message containing:
  - Bot process uptime,
  - Host platform & OS release,
  - Node.js runtime version,
  - Free and total system RAM in GB,
  - Total count of mounted projects loaded from `projects.yaml`.
- And the message concludes with a textual next-step hint (e.g., `Next: /projects`).

### Review Findings

- [x] [Review][Patch] Escape Telegram Markdown special characters in telemetry message [`backend/src/core/telemetry.ts:149`]
- [x] [Review][Patch] Connect status handler to active ProjectRegistry to eliminate redundant synchronous file parsing and path divergence [`backend/src/bot/bot.ts:13`]
- [x] [Review][Patch] Sanitize finite number check in `formatUptime` [`backend/src/core/telemetry.ts:188`]
- [x] [Review][Patch] Add unit test for `/status` command execution under default options [`backend/tests/status.test.ts:540`]

#### Rejected
- `backend/src/bot/handlers/status.ts` -- Local try/catch missing around `ctx.reply`: rejected (low severity; grammY's global `bot.catch` already centrally catches and logs all unhandled command handler errors).

## Implementation Notes

- Implemented `backend/src/core/telemetry.ts` collecting:
  - `process.uptime()` and `os.uptime()` formatted into human-readable intervals (days, hours, minutes, seconds).
  - `process.platform` and `os.release()` for host runtime diagnostics.
  - `process.version` for Node.js engine reporting.
  - `os.freemem()` and `os.totalmem()` converted and rounded to GB.
  - `getMountedProjectsCount` with graceful fallback when `projects.yaml` is not yet configured.
- Implemented `/status` command handler in `backend/src/bot/handlers/status.ts` sending formatted Markdown message with next-action hint (`👉 _Next:_ /projects or /ping`).
- Wired `/status` handler into grammY bot in `backend/src/bot/bot.ts`.
- Created comprehensive unit and integration test suite in `backend/tests/status.test.ts` (15 tests) verifying < 2.0s response time, metric calculations, Markdown formatting, zero-file fallback, and unauthorized silent drop.

## Spec Change Log

## Review Triage Log

- `backend/src/core/telemetry.ts` -- Clean OS metrics collection with zero event-loop blocking.
- `backend/src/bot/handlers/status.ts` -- Fast synchronous formatting with Markdown parse mode.
- `backend/tests/status.test.ts` -- 15 tests passed covering 100% of I/O & Edge-Case Matrix rows and Acceptance Criteria.
- Matrix Test Audit: 100% matrix rows verified and tested.

## Design Notes
