---
title: 'Story 2.1: Task State Machine, Correlation & Startup Recovery'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Remote task executions need formal lifecycle tracking and correlation IDs to avoid ambiguous states, and workstation reboots must never leave zombie background processes running.
**Approach:** Implement a formal task state enum (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`) with UUID v4 + 6-char hex display ID, active task persistence (`.mbridge/active-tasks.json`), and startup recovery cleanup.

## Boundaries & Constraints

**Always:**
- Transition tasks strictly through: `QUEUED` -> `RUNNING` -> (`COMPLETED` | `FAILED` | `CANCELLED` | `TIMED_OUT`).
- Assign internal UUID v4 and a 6-character hex display ID (e.g. `3a8f12`).
- Update `.mbridge/active-tasks.json` on task launch and clear or mark terminal upon finish.
- On startup `RECOVERY_MODE`, inspect recorded active PIDs, terminate verified orphaned trees, and mark tasks `FAILED` (`SERVER_RESTARTED`).

**Never:**
- Allow undefined or skipped state transitions.
- Leave lingering PID entries in `.mbridge/active-tasks.json` across crashes without recovery.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New Task Instantiation | Command execution dispatched | State `QUEUED`, UUID and 6-char hex assigned | N/A |
| Task Enters Execution | Subprocess spawned | State `RUNNING`, entry in `.mbridge/active-tasks.json` | N/A |
| Bot Crash & Restart Recovery | Active tasks in `.mbridge/active-tasks.json` on boot | Verified orphan PIDs terminated, tasks marked `FAILED (SERVER_RESTARTED)` | Clear active tasks file |

</frozen-after-approval>

## Code Map

- `src/core/task/task.types.ts` -- State enum, task model, and metadata definitions
- `src/core/task/task-manager.ts` -- State machine transitions, correlation ID generator, and active tasks persistence
- `src/core/task/recovery.ts` -- Startup recovery logic inspecting and cleaning orphaned PIDs
- `tests/task-state-machine.test.ts` -- Unit tests for transitions, display IDs, and recovery logic

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/task/task.types.ts` -- Define TaskState enum and Task interface
- [ ] `src/core/task/task-manager.ts` -- Implement TaskManager with lifecycle transitions and JSON persistence
- [ ] `src/core/task/recovery.ts` -- Implement startup orphan PID verification and cleanup
- [ ] `src/index.ts` -- Call recovery routine during startup sequence
- [ ] `tests/task-state-machine.test.ts` -- Test state transitions and recovery from simulated crash state

**Acceptance Criteria:**
- Given a new execution request, when the task is instantiated, then it is assigned an internal UUID v4 and a 6-character hex display ID (e.g. `3a8f12`), and transitions strictly through the formal enum: `QUEUED` -> `RUNNING` -> (`COMPLETED` | `FAILED` | `CANCELLED` | `TIMED_OUT`).
- Given a task transitions to `RUNNING`, when the child process is spawned, then MBridge writes/updates `.mbridge/active-tasks.json` recording `taskId`, `displayId`, `projectAlias`, `rootPid`, `command`, and `startedAt`, and removes or marks the entry terminal upon task completion.
- Given MBridge starts up and discovers an existing `.mbridge/active-tasks.json` with active entries, when the `RECOVERY_MODE` system phase executes, then it inspects each recorded PID, verifies process identity and start timestamp against OS process tables, terminates any verified orphaned child trees, marks the recorded tasks as `FAILED` (reason: `SERVER_RESTARTED`), and clears the active tasks file.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
