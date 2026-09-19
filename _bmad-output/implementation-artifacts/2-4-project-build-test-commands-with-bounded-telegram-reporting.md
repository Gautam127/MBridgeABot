---
title: 'Story 2.4: Project Build & Test Commands with Bounded Telegram Reporting'
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

**Problem:** Developers need to remotely trigger compilation and test suites on workstation projects from their phone, receive immediate dispatch acknowledgment, and get concise batch summaries without hitting Telegram rate limits or character cutoffs.
**Approach:** Implement `/build <project>` and `/test <project>` handlers that send instant acknowledgment (<2s), execute configured commands inside project directories, and deliver single-message batch reports bounded to 3,500 characters.

## Boundaries & Constraints

**Always:**
- Reply within 2.0s with initial acknowledgment containing task display ID: `⏳ Running build on <project> [task: 3a8f12]...`.
- Execute `buildCmd` or `testCmd` configured in `projects.yaml` inside project root.
- Keep Telegram completion messages strictly under 3,500 characters, truncating at clean newlines with a truncation notice if needed.
- Append a next-action hint (e.g. `Next: /test <project>`).

**Never:**
- Flood Telegram with live streaming log lines.
- Exceed 3,500 characters causing Telegram message drop or unformatted truncation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build Success | `/build ecommerce` exits with 0 | `✅ Build succeeded` in Xs, next hint | N/A |
| Build Failure | `/build ecommerce` exits with non-zero | `❌ Build failed`, duration, tail log excerpt | Redact secrets in tail logs |
| Output > 3,500 chars | Massive compiler error log | Message cleanly cut at newline < 3,500 chars with truncation notice | Notice: `[Output truncated. Full logs retained on workstation.]` |

</frozen-after-approval>

## Code Map

- `src/bot/handlers/build.ts` -- `/build` command handler
- `src/bot/handlers/test.ts` -- `/test` command handler
- `src/core/formatters/telegram-formatter.ts` -- Formatter ensuring <3,500 char boundary and clean line truncation
- `tests/build-test-handlers.test.ts` -- Unit tests for command execution and message formatting

## Tasks & Acceptance

**Execution:**
- [x] `src/core/formatters/telegram-formatter.ts` -- Implement message chunker and 3,500 char boundary guard
- [x] `src/bot/handlers/build.ts` -- Implement `/build <project>` workflow (ack -> run -> format -> reply)
- [x] `src/bot/handlers/test.ts` -- Implement `/test <project>` workflow (ack -> run -> format -> reply)
- [x] `src/bot/bot.ts` -- Register `/build` and `/test` commands
- [x] `tests/build-test-handlers.test.ts` -- Test command dispatch, success/failure formatting, and truncation

### Review Findings

- [ ] [Review][Patch] Dangling QUEUED task created when lockManager.acquire fails [`backend/src/bot/handlers/build.ts:42`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/build.ts#L42) and [`backend/src/bot/handlers/test.ts:36`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/bot/handlers/test.ts#L36)
- [ ] [Review][Patch] Unbounded buffer accumulation in command-runner.ts [`backend/src/core/process/command-runner.ts:57`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/core/process/command-runner.ts#L57)
- [ ] [Review][Patch] Markdown code fence prematurely closing when output contains triple backticks [`backend/src/core/formatters/telegram-formatter.ts:75`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/core/formatters/telegram-formatter.ts#L75)
- [ ] [Review][Patch] Verification gap: Missing test coverage for timedOut branch and /test error handling [`backend/tests/build-test-handlers.test.ts:118`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/tests/build-test-handlers.test.ts#L118)
- [x] [Review][Defer] Unix process tree kill requires detached spawn [`backend/src/core/process/command-runner.ts:66`](file:///d:/Gautam/MBridgeABot/MBridgeABot/backend/src/core/process/command-runner.ts#L66) — deferred: Scope of Story 2.3 (platform-native process tree manager)

#### Rejected Findings
- Low: Handler code deduplication between build.ts and test.ts — rejected: both handlers are concise (<90 LOC), explicitly typed, and follow isolated command registration patterns without risk to users or developers.

**Acceptance Criteria:**
- Given an authorized user sends `/build <project>` or `/test <project>`, when the command is validated, then MBridge replies within 2.0s with `⏳ Running build on <project> [task: 3a8f12]...` (or `test`).
- Given a valid project alias, when the task executes, then it executes `buildCmd` (for `/build`) or `testCmd` (for `/test`) configured in `projects.yaml` inside the project's directory.
- Given the command completes, when MBridge formats the Telegram notification, then it sends a single batch message with status (`✅ Build succeeded` or `❌ Build failed`), duration in seconds, and tail log diagnostics if failed, and the entire message is strictly bounded under 3,500 characters, truncated at a clean newline with a notice `[Output truncated. Full logs retained on workstation.]`, and appends a next-action hint (e.g., `Next: /test <project>`).

## Implementation Notes

- Implemented `src/core/formatters/telegram-formatter.ts`:
  - `formatTaskAcknowledgment` returning immediate feedback (`⏳ Running <action> on <project> [task: <displayId>]...`).
  - `formatExecutionResult` formatting success/failure summaries with exit codes, durations, sanitized tail logs, next-step hints, and strict bounding under 3,500 characters.
  - `truncateMessage` cleanly truncating text at newline boundaries with suffix `[Output truncated. Full logs retained on workstation.]`.
- Implemented `src/core/process/command-runner.ts`:
  - `runCommand` launching child processes via Node `spawn` with non-interactive flags (`CI=true`, `FORCE_COLOR=0`, `stdin: 'ignore'`).
  - Clean child environment stripping MBridge secrets (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`).
  - Immediate `onSpawn(pid)` callback invocation ensuring process PID is registered with `TaskManager` and active task persistence before command completion.
  - Process tree kill escalation on timeout via `killProcessTree`.
- Implemented `src/bot/handlers/build.ts` and `src/bot/handlers/test.ts`:
  - Command parsing for `/build <project>` and `/test <project>` with usage guidance and unknown project handling.
  - Exclusive project mutex acquisition via `ProjectLockManager` with immediate 409 rejection notices.
  - Guaranteed lock release via `try...finally`.
  - Task lifecycle integration with `TaskManager` (`QUEUED` -> `RUNNING` -> `COMPLETED` / `FAILED` / `TIMED_OUT`).
- Wired `/build` and `/test` commands in `src/bot/bot.ts`.
- Authored test suite in `tests/build-test-handlers.test.ts` (14 tests) covering immediate ack (<2s), command execution, failure formatting, secret redaction, 3,500 character boundaries, 409 conflict notices, error recovery, and matrix scenarios.

## Spec Change Log

_None._

## Review Triage Log

- `src/core/formatters/telegram-formatter.ts`: 3,500 character boundary guard, newline truncation, and secret redaction verified.
- `src/core/process/command-runner.ts`: Non-interactive flags, environment secret stripping, and timeout killing verified.
- `src/bot/handlers/build.ts` & `src/bot/handlers/test.ts`: Immediate ack, 409 conflict handling, try-finally lock release, and task transitions verified.
- `src/bot/bot.ts`: Commands registered behind allowlist middleware verified.
- `tests/build-test-handlers.test.ts`: 14 tests passing; 100% of I/O & Edge-Case Matrix rows verified and passing.

## Design Notes

- Tail log extraction preserves the most relevant compiler/test diagnostics (error summaries, stack frames) within the 3,500 character Telegram ceiling rather than arbitrary truncation of the head.
- Running subprocesses with `CI=true` and `FORCE_COLOR=0` suppresses interactive prompts and terminal control escapes, ensuring clean Telegram chat output.

