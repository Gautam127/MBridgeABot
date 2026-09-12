---
title: 'Story 2.3: Subprocess Runner & Platform-Native Process Tree Manager'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Subprocesses can hang waiting for interactive input, consume unbounded memory buffering logs, exceed reasonable runtimes, or escape termination as orphaned grandchild processes.
**Approach:** Implement `SubprocessRunner` using `execa` with non-interactive flags (`shell: false`, `stdin: 'ignore'`, `CI=true`), bounded stream retention (512 KB / 1,000 lines), hard 600s timeout, and platform-native process tree killing.

## Boundaries & Constraints

**Always:**
- Spawn with `shell: false`, `stdin: 'ignore'`, `CI=true`, and completely strip MBridge's `.env` from child environment.
- Bound stream buffer to 512 KB (`maxOutputBytes`) and 1,000 lines (`maxRetainedLines`), keeping head and tail lines with truncation notice.
- Enforce 600s hard timeout; terminate process tree and mark task `TIMED_OUT` if exceeded.
- Terminate process trees using Windows `taskkill /F /T /PID <pid>` and POSIX `SIGTERM`/`SIGKILL` to process groups (`-pid`).

**Never:**
- Forward `TELEGRAM_BOT_TOKEN` or `.env` secrets into child processes.
- Allow zombie child/grandchild processes to persist after timeout or kill signals.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal Subprocess Run | Command completes within 600s | Exit code, duration, captured stdout/stderr | Bounded buffer captures head & tail |
| Process Exceeds Timeout | Execution runs > 600s | Process tree killed, task marked `TIMED_OUT` | Notify Telegram with timeout notice |
| Kill Tree on Windows | Kill requested for root PID | Runs `taskkill /F /T /PID <pid>` | Catch exceptions and log |
| Kill Tree on POSIX | Kill requested for root PID | Sends `SIGTERM` to `-pid`, escalates to `SIGKILL` after 5s | Escalates cleanly |

</frozen-after-approval>

## Code Map

- `src/core/process/subprocess-runner.ts` -- `execa` wrapper with bounded streaming and timeouts
- `src/core/process/process-tree-manager.ts` -- Cross-platform process tree killer (`taskkill` vs `-pid`)
- `src/core/process/output-buffer.ts` -- Rolling bounded buffer preserving head and tail lines
- `tests/subprocess-runner.test.ts` -- Unit tests for output bounding, timeout termination, and env filtering

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/process/output-buffer.ts` -- Implement head/tail line and byte bounded rolling buffer
- [ ] `src/core/process/process-tree-manager.ts` -- Implement OS-specific process tree termination
- [ ] `src/core/process/subprocess-runner.ts` -- Implement non-interactive `execa` runner with timeout management
- [ ] `tests/subprocess-runner.test.ts` -- Test environment filtering, non-interactive execution, and stream bounds

**Acceptance Criteria:**
- Given an execution command, when `SubprocessRunner` spawns the child process via `execa`, then it runs with `shell: false`, `stdin: 'ignore'`, and environment variables `CI=true` and `FORCE_COLOR=0`, and MBridge's own `.env` variables are completely omitted from the child process environment.
- Given a subprocess emitting high-volume stdout/stderr, when streaming output, then the in-memory stream buffer retains a maximum of 512 KB (`maxOutputBytes`) and 1,000 lines (`maxRetainedLines`), preserving the initial head lines and trailing tail lines with a truncation notice if limits are exceeded.
- Given a running subprocess that exceeds the 600s (10m) execution ceiling, when the timeout fires, then `SubprocessRunner` triggers `ProcessTreeManager` termination, marks the task `TIMED_OUT`, and notifies Telegram with `⏱️ Task [3a8f12] timed out after 10m and was terminated.`
- Given a running process tree with root PID, when `ProcessTreeManager.kill(pid)` is called, then on Windows it executes `taskkill /F /T /PID <pid>`, and on POSIX it sends `SIGTERM` to the process group (`-pid`) followed by `SIGKILL` escalation after 5s if still active.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
