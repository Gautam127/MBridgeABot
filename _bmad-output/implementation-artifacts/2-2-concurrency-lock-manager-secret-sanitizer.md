---
title: 'Story 2.2: Concurrency Lock Manager & Secret Sanitizer'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Concurrent commands on the same project workspace can corrupt files or race on compiler outputs, and child process outputs or exceptions can leak sensitive bot tokens and API keys to chat.
**Approach:** Implement `ProjectLockManager` to enforce exclusive execution locks per project alias with non-blocking rejection, and `SecretSanitizer` to scrub sensitive credentials from all streams and messages.

## Boundaries & Constraints

**Always:**
- Enforce exclusive lock per project alias; reject conflicting tasks immediately with 409 notice.
- Guarantee lock release using `try...finally` in the execution pipeline.
- Allow independent projects to run concurrently without blocking each other.
- Scrub `TELEGRAM_BOT_TOKEN`, project secrets, and standard token patterns (`ghp_`, Bearer) with `[REDACTED]`.

**Never:**
- Allow multiple mutating tasks on the same project alias simultaneously.
- Send unredacted credentials to Telegram messages or write them to logs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lock Acquisition on Free Project | Command on idle project | Lock acquired, task proceeds | N/A |
| Lock Conflict on Busy Project | Command on already locked project | Rejected immediately with 409 message | Return conflict message indicating active task ID |
| Output Containing Bot Token | Raw process output containing bot token | Token replaced with `[REDACTED]` | Sanitizer handles regex replacements |

</frozen-after-approval>

## Code Map

- `src/core/lock/project-lock-manager.ts` -- In-memory project mutex registry
- `src/core/security/secret-sanitizer.ts` -- Secret redaction engine
- `tests/lock-manager.test.ts` -- Concurrency and conflict tests
- `tests/secret-sanitizer.test.ts` -- Regex redaction tests for tokens and env values

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/lock/project-lock-manager.ts` -- Implement `acquire(alias, taskId)` and `release(alias)`
- [ ] `src/core/security/secret-sanitizer.ts` -- Implement redaction for tokens, keys, and patterns
- [ ] `tests/lock-manager.test.ts` -- Test single lock per alias, release in finally, and multi-project concurrency
- [ ] `tests/secret-sanitizer.test.ts` -- Test redaction of Telegram tokens and sensitive env variables

**Acceptance Criteria:**
- Given an execution task is running on project alias `mbridge`, when a second command (`/build`, `/test`, or `/agent`) is received for `mbridge`, then `ProjectLockManager` rejects the second request immediately with a 409 conflict message: `⚠️ Project "mbridge" is busy running task [3a8f12]. Use /cancel mbridge to abort it first.`, and permits commands targeting independent project aliases to acquire their respective locks and run concurrently.
- Given a task finishes, fails, times out, or is cancelled, when the execution pipeline terminates, then `ProjectLockManager.release(alias)` is guaranteed to execute via a `try...finally` block, ensuring no project remains permanently locked.
- Given any command stdout, stderr, exception trace, or log output, when processed by `SecretSanitizer`, then the `TELEGRAM_BOT_TOKEN`, configured project secrets, and standard token patterns (e.g. `ghp_[A-Za-z0-9]+`, Bearer tokens) are replaced with `[REDACTED]` prior to sending to Telegram or writing to logs.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
