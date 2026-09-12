---
title: 'Story 1.3: Workstation Telemetry & System Status Command'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `src/core/telemetry.ts` -- Implement system vitals collector (uptime, OS, RAM, Node version)
- [ ] `src/bot/handlers/status.ts` -- Implement `/status` command handler with formatted output and next-action hint
- [ ] `src/bot/bot.ts` -- Wire `/status` handler into bot
- [ ] `tests/status.test.ts` -- Test output formatting and telemetry values

**Acceptance Criteria:**
- Given an authorized user messages the bot, when the user sends `/status`, then MBridge replies within 2.0s with a clean, Markdown-formatted telemetry message containing:
  - Bot process uptime,
  - Host platform & OS release,
  - Node.js runtime version,
  - Free and total system RAM in GB,
  - Total count of mounted projects loaded from `projects.yaml`.
- And the message concludes with a textual next-step hint (e.g., `Next: /projects`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
