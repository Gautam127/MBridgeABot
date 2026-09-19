---
title: 'Story 2.5: Process Cancellation Command (/cancel)'
type: 'feature'
created: '2026-09-10'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '3f0591477ad9bf6733ed26e0b38f1dfb3e48aaef'
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
- [x] `src/core/task/process-registry.ts` -- Implement registry mapping project aliases to running process instances
- [x] `src/bot/handlers/cancel.ts` -- Implement `/cancel <project>` command handler
- [x] `src/bot/bot.ts` -- Register `/cancel` command handler
- [x] `tests/cancel-handler.test.ts` -- Test cancellation of active task and response for idle project

**Acceptance Criteria:**
- Given a task `[3a8f12]` is currently `RUNNING` on project `webapp`, when the user sends `/cancel webapp`, then MBridge immediately calls `ProcessTreeManager` to terminate the process tree, and transitions the task state to `CANCELLED`, releases the project lock, and replies `🛑 Task [3a8f12] on "webapp" has been cancelled.`
- Given no task is currently active on project `webapp`, when the user sends `/cancel webapp`, then MBridge replies `ℹ️ No active task running on project "webapp".`

### Review Findings

- [ ] [Review][Patch] CancelHandler skips cancellation when task is in QUEUED state [`backend/src/bot/handlers/cancel.ts:69`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/cancel.ts#L69)
- [ ] [Review][Patch] Prevent orphaned child process if task was cancelled before onSpawn executes [`backend/src/bot/handlers/build.ts:71`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/build.ts#L71) and [`backend/src/bot/handlers/test.ts:70`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/test.ts#L70)
- [ ] [Review][Patch] Concurrent lock acquisition cleanup in build.ts and test.ts [`backend/src/bot/handlers/build.ts:50`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/build.ts#L50) and [`backend/src/bot/handlers/test.ts:49`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/test.ts#L49)
- [ ] [Review][Patch] Verification gap: Missing test for cancelling a QUEUED task [`backend/tests/cancel-handler.test.ts:160`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/tests/cancel-handler.test.ts#L160)

## Implementation Notes

- Implemented `src/core/process/process-tree-manager.ts`:
  - `ProcessTreeManager` provides cross-platform child process tree termination.
  - Windows: Executes `taskkill /pid <pid> /T /F` with fallback to `process.kill(pid, 'SIGKILL')`.
  - POSIX: Dispatches signal to process group (`-pid`) with escalation to `SIGKILL`.
  - Exported singleton `defaultProcessTreeManager`.
- Implemented `src/core/task/process-registry.ts`:
  - `RuntimeProcessRegistry` tracks running project task instances, display IDs, and OS root PIDs.
  - Case-insensitive alias normalization (`toLowerCase()`).
  - Exported singleton `defaultProcessRegistry`.
- Implemented `src/bot/handlers/cancel.ts`:
  - Validates command syntax (`/cancel <project-alias>`) and project existence.
  - Inspects `processRegistry`, `taskManager.getActiveTasks()`, and `lockManager.getLock()` to locate active tasks.
  - Replies `ℹ️ No active task running on project "<project>".` when project is idle.
  - Kills OS process tree via `ProcessTreeManager.kill(rootPid)`.
  - Transitions task state to `TaskState.CANCELLED`.
  - Guaranteed `try...finally` lock release and registry unregistration.
  - Replies `🛑 Task [<displayId>] on "<project>" has been cancelled.`
- Updated `src/bot/handlers/build.ts` & `src/bot/handlers/test.ts`:
  - Registered subprocess PIDs into `RuntimeProcessRegistry` in `onSpawn`.
  - Checks if task was cancelled before emitting completion/failure Telegram reports, preventing conflicting notifications.
  - Checks lock upfront before creating tasks, preventing dangling `QUEUED` records.
- Registered `/cancel` command in `src/bot/bot.ts`.
- Authored test suite `tests/cancel-handler.test.ts` (10 tests) validating idle replies, unknown project rejection, active task cancellation, build/cancel coordination, lock release invariants, and process tree termination.

## Spec Change Log

_None._

## Review Triage Log

- `src/core/process/process-tree-manager.ts`: Windows taskkill and POSIX process tree termination verified.
- `src/core/task/process-registry.ts`: Process tracking and case-insensitive normalization verified.
- `src/bot/handlers/cancel.ts`: Active cancellation, idle notification, and try-finally lock release verified.
- `src/bot/bot.ts`: `/cancel` command registration behind allowlist middleware verified.
- `tests/cancel-handler.test.ts`: 10 tests passing; 100% of I/O & Edge-Case Matrix rows verified and passing.

## Design Notes

- Project lock and process registry cleanup are wrapped in a `finally` block in `cancel.ts`, ensuring that even unexpected process termination errors guarantee the workstation project is unlocked for future runs.
- Cancellation awareness in `build.ts` and `test.ts` prevents race conditions where an aborted subprocess might otherwise emit a false compiler failure report.

