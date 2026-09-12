---
title: 'Story 4.3: Autonomous Agent Dispatch & Change Impact Reporting (/agent)'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Developers want to dispatch coding tasks to local AI agents from their phone, receive immediate acknowledgment, and receive an automated impact summary (files modified, created, deleted) when the agent finishes.
**Approach:** Implement `/agent <project> <prompt>` command handler that dispatches the configured `AgentAdapter` under the project lock, runs `git status --porcelain` on finish, and delivers a concise impact summary with testing suggestions.

## Boundaries & Constraints

**Always:**
- Reply within 2.0s with initial dispatch acknowledgment and task display ID: `⏳ Delegating task to Antigravity on <project> [task: 3a8f12]...`.
- Acquire project lock before executing agent.
- Run `git status --porcelain` upon agent completion to calculate modified, created, and deleted counts.
- Format summary with task status, execution time in seconds, file impact breakdown, and advisory next hint (`Ready for desk review. Use /test <project> to verify.`).

**Never:**
- Allow agent task to push or commit changes directly.
- Leave project locked if agent fails or errors.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful Agent Run | Prompt modifies 2 files, creates 1 | Telegram receives completion summary: duration, `📁 2 files modified, 1 file created`, next hint | N/A |
| Agent Exits with Error | Agent exits code 1 | Reports `❌ Agent exited with code 1`, duration, error excerpt | Release project lock |
| Unchanged Working Tree | Agent runs without touching files | Reports `✅ Agent completed (0 files changed)` | N/A |

</frozen-after-approval>

## Code Map

- `src/bot/handlers/agent.ts` -- `/agent <project> <prompt>` command handler
- `src/core/git/impact-reporter.ts` -- Git porcelain parser computing file modification metrics
- `tests/agent-handler.test.ts` -- Unit tests for agent command dispatch and impact metric parsing

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/git/impact-reporter.ts` -- Implement `calculateImpact(projectPath)` parsing `git status --porcelain`
- [ ] `src/bot/handlers/agent.ts` -- Implement `/agent` command handler (ack -> dispatch -> calculate impact -> reply)
- [ ] `src/bot/bot.ts` -- Register `/agent` command
- [ ] `tests/agent-handler.test.ts` -- Test command dispatch, duration tracking, and porcelain impact parsing

**Acceptance Criteria:**
- Given an authorized user sends `/agent <project> <prompt>`, when the command is received and project lock acquired, then MBridge replies within 2.0s with `⏳ Delegating task to Antigravity on <project> [task: 3a8f12]...`.
- Given the agent finishes execution (succeeded or failed), when MBridge handles the completion lifecycle, then it runs `git status --porcelain` in the project directory to calculate the impact, and parses the output to determine total files modified, created, and deleted.
- Given the impact metrics are calculated, when MBridge sends the completion notification to Telegram, then it delivers a concise summary:
  - Task status (`✅ Agent completed` or `❌ Agent exited with code <N>`),
  - Total execution time in seconds,
  - File change breakdown (e.g. `📝 3 files modified, 1 file created`),
  - Advisory next-step hint: `Ready for desk review. Use /test <project> to verify.`

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
