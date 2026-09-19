---
title: 'Story 2.2: Concurrency Lock Manager & Secret Sanitizer'
type: 'feature'
created: '2026-09-10'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '8a98b1adf2c87f0f68aa1b13c40145fbb4328fe8'
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
- [x] `src/core/lock/project-lock-manager.ts` -- Implement `acquire(alias, taskId)` and `release(alias)`
- [x] `src/core/security/secret-sanitizer.ts` -- Implement redaction for tokens, keys, and patterns
- [x] `tests/lock-manager.test.ts` -- Test single lock per alias, release in finally, and multi-project concurrency
- [x] `tests/secret-sanitizer.test.ts` -- Test redaction of Telegram tokens and sensitive env variables

**Acceptance Criteria:**
- Given an execution task is running on project alias `mbridge`, when a second command (`/build`, `/test`, or `/agent`) is received for `mbridge`, then `ProjectLockManager` rejects the second request immediately with a 409 conflict message: `⚠️ Project "mbridge" is busy running task [3a8f12]. Use /cancel mbridge to abort it first.`, and permits commands targeting independent project aliases to acquire their respective locks and run concurrently.
- Given a task finishes, fails, times out, or is cancelled, when the execution pipeline terminates, then `ProjectLockManager.release(alias)` is guaranteed to execute via a `try...finally` block, ensuring no project remains permanently locked.
- Given any command stdout, stderr, exception trace, or log output, when processed by `SecretSanitizer`, then the `TELEGRAM_BOT_TOKEN`, configured project secrets, and standard token patterns (e.g. `ghp_[A-Za-z0-9]+`, Bearer tokens) are replaced with `[REDACTED]` prior to sending to Telegram or writing to logs.

### Review Findings

- [ ] [Review][Patch] Guard sanitizeObject against infinite recursion on circular object references [`backend/src/core/security/secret-sanitizer.ts:145`]
- [ ] [Review][Patch] Ensure dynamic pickup of process.env.TELEGRAM_BOT_TOKEN in SecretSanitizer [`backend/src/core/security/secret-sanitizer.ts:54`]
- [ ] [Review][Patch] Gracefully handle non-string or empty alias in isLocked and getLock [`backend/src/core/lock/project-lock-manager.ts:33`]

#### Rejected
- `backend/src/core/lock/project-lock-manager.ts:43` — `acquire` is synchronous in-memory mutex and does not use distributed Redis locking: rejected (false / out of scope; MBridge is a single-instance workstation bridge bot as per PRD/Architecture).
- `backend/src/core/security/secret-sanitizer.ts:98` — `sanitize` reconstructs RegExp for each custom secret on every call: rejected (low severity; secret count is minimal and regex compilation overhead is negligible).

## Implementation Notes

- Implemented `src/core/lock/project-lock-manager.ts`:
  - `ProjectLockManager` class managing exclusive per-project locks with normalized alias keys (`alias.trim().toLowerCase()`).
  - `acquire(alias, taskId, displayId)` throwing 409 `ProjectLockedError` formatted as `⚠️ Project "${alias}" is busy running task [${displayId}]. Use /cancel ${alias} to abort it first.` upon conflicting lock attempts.
  - `release(alias, taskId?)` releasing locks safely with optional task ownership validation.
  - `withLock<T>(alias, taskId, displayId, action)` ensuring release via `try...finally`.
  - Exported singleton `defaultProjectLockManager`.
- Implemented `src/core/security/secret-sanitizer.ts`:
  - `SecretSanitizer` class providing regex redaction for Telegram bot tokens (`\d{6,12}:[A-Za-z0-9_-]{30,45}` standalone and within URLs), GitHub PATs (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), Bearer authorization tokens, AWS Access Key IDs, `sk-` API keys, and PEM private key blocks.
  - Dynamic registration for arbitrary custom project secrets with regex character escaping and longest-first matching.
  - Deep traversal object/array and Error message/stack trace sanitization (`sanitizeObject`, `sanitizeError`).
  - Exported singleton `defaultSecretSanitizer` and helper `sanitizeOutput(text)`.
- Implemented test suites:
  - `tests/lock-manager.test.ts` (14 tests) covering lock acquisition, 409 conflict formatting, case insensitivity, multi-project concurrency, try-finally guarantees, and matrix scenarios.
  - `tests/secret-sanitizer.test.ts` (18 tests) covering bot tokens, URL tokens, PATs, Bearer headers, custom secrets, error stacks, object trees, and matrix scenarios.

## Spec Change Log

_None._

## Review Triage Log

- `src/core/lock/project-lock-manager.ts`: Mutex registry, case insensitivity, 409 conflict message formatting, and try-finally guarantee verified.
- `src/core/security/secret-sanitizer.ts`: Redaction of Telegram tokens, PATs, Bearer headers, custom secrets, object trees, and error stacks verified.
- `tests/lock-manager.test.ts`: 14 tests passing; Matrix Scenarios 1 & 2 verified.
- `tests/secret-sanitizer.test.ts`: 18 tests passing; Matrix Scenario 3 verified.
- Total test suite: 122 tests passing across all backend modules.

## Design Notes

- Project alias normalization (`toLowerCase()`) ensures that casing variations in Telegram commands (`/build MBridge` vs `/test mbridge`) resolve to the identical mutex key.
- `SecretSanitizer` regex incorporates lookbehind for `/bot<token>` URL patterns to ensure Telegram API request logs (e.g. failed HTTP queries) do not leak the bot token.

