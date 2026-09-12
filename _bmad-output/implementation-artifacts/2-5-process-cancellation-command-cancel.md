---
title: 'Story 2.5: Process Cancellation Command (/cancel)'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** If a build, test suite, or coding task hangs or enters an infinite loop, the developer needs a way to remotely abort the process tree from their phone and free up the project lock.
**Approach:** Implement `/cancel <project>` command handler that locates active child processes in the registry, calls `ProcessTreeManager` to terminate the process tree, releases project locks, and confirms termination.

## Boundaries & Constraints

**Always:**
- Locate active task root PID via `RuntimeProcessRegistry` for the target project.
- Trigger `ProcessTreeManager.kill(pid)` to reliably terminate the process tree on Windows or POSIX.
- Transition task state to `CANCELLED`, release project lock in `finally`, and notify Telegram.
- Reply `ℹ️ No active task running on project "<project>"` if no process is active.

**Never:**
- Leave child processes or process groups running after cancellation confirmation.
- Keep the project lock engaged after cancellation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Active Task Cancelled | `/cancel webapp` while task `[3a8f12]` is running | Process tree terminated, lock released, reply `🛑 Task [3a8f12] on "webapp" has been cancelled.` | Escalate to SIGKILL if needed |
| No Active Task | `/cancel webapp` while project is idle | Reply `ℹ️ No active task running on project "webapp".` | N/A |
| Unknown Project Alias | `/cancel unknown` | Error listing valid project aliases | N/A |

</frozen-after-approval>

## Code Map

- `src/bot/handlers/cancel.ts` -- `/cancel` command handler
- `src/core/task/process-registry.ts` -- In-memory tracking of running project tasks and root PIDs
- `src/core/process/process-tree-manager.ts` -- Process tree termination engine
- `tests/cancel-handler.test.ts` -- Unit tests for process cancellation and idle state replies

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/task/process-registry.ts` -- Implement registry mapping project aliases to running process instances
- [ ] `src/bot/handlers/cancel.ts` -- Implement `/cancel <project>` command handler
- [ ] `src/bot/bot.ts` -- Register `/cancel` command handler
- [ ] `tests/cancel-handler.test.ts` -- Test cancellation of active task and response for idle project

**Acceptance Criteria:**
- Given a task `[3a8f12]` is currently `RUNNING` on project `webapp`, when the user sends `/cancel webapp`, then MBridge immediately calls `ProcessTreeManager` to terminate the process tree, and transitions the task state to `CANCELLED`, releases the project lock, and replies `🛑 Task [3a8f12] on "webapp" has been cancelled.`
- Given no task is currently active on project `webapp`, when the user sends `/cancel webapp`, then MBridge replies `ℹ️ No active task running on project "webapp".`

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
