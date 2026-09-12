---
title: 'Story 2.4: Project Build & Test Commands with Bounded Telegram Reporting'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
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
- [ ] `src/core/formatters/telegram-formatter.ts` -- Implement message chunker and 3,500 char boundary guard
- [ ] `src/bot/handlers/build.ts` -- Implement `/build <project>` workflow (ack -> run -> format -> reply)
- [ ] `src/bot/handlers/test.ts` -- Implement `/test <project>` workflow (ack -> run -> format -> reply)
- [ ] `src/bot/bot.ts` -- Register `/build` and `/test` commands
- [ ] `tests/build-test-handlers.test.ts` -- Test command dispatch, success/failure formatting, and truncation

**Acceptance Criteria:**
- Given an authorized user sends `/build <project>` or `/test <project>`, when the command is validated, then MBridge replies within 2.0s with `⏳ Running build on <project> [task: 3a8f12]...` (or `test`).
- Given a valid project alias, when the task executes, then it executes `buildCmd` (for `/build`) or `testCmd` (for `/test`) configured in `projects.yaml` inside the project's directory.
- Given the command completes, when MBridge formats the Telegram notification, then it sends a single batch message with status (`✅ Build succeeded` or `❌ Build failed`), duration in seconds, and tail log diagnostics if failed, and the entire message is strictly bounded under 3,500 characters, truncated at a clean newline with a notice `[Output truncated. Full logs retained on workstation.]`, and appends a next-action hint (e.g., `Next: /test <project>`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
