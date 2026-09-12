---
title: 'Story 4.2: Standard AgentAdapter Contract & Antigravity CLI Provider'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** MBridge must support AI coding agents through a clean pluggable interface so that multiple agent providers (Antigravity, Claude CLI, Codex) can be swapped without rewriting bot logic.
**Approach:** Define the TypeScript `AgentAdapter` interface contract and implement the Google Antigravity CLI (`agy`) adapter executing non-interactively with project `cwd` and the 3-Tier Git Guard active.

## Boundaries & Constraints

**Always:**
- Implement `AgentAdapter` interface requiring `name` and `execute(params)`.
- Invoke `agy` in non-interactive/headless mode, passing user prompt sanitized.
- Lock `cwd` strictly to project's canonical path.
- Enforce `stdin: 'ignore'`, `CI=true`, and active 3-Tier Git Guard.

**Never:**
- Execute agents in interactive terminal prompts that hang waiting for human input.
- Allow agent processes to bypass the 3-tier Git delivery guard.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Antigravity Adapter Dispatch | Prompt: `Fix auth issue`, project path | Spawns `agy` non-interactively, captures exitCode and output | N/A |
| Agent Execution Timeout | Agent exceeds timeout | Terminates process tree via `ProcessTreeManager` | Return error with timeout exit code |
| CLI Binary Missing | `agy` not installed on host PATH | Catches ENOENT spawn error | Reports clear CLI missing diagnostic |

</frozen-after-approval>

## Code Map

- `src/core/agent/agent.interface.ts` -- Standard `AgentAdapter` TypeScript interface
- `src/core/agent/agent-factory.ts` -- Provider resolver mapping string to adapter
- `src/core/agent/adapters/antigravity.adapter.ts` -- Google Antigravity CLI (`agy`) adapter implementation
- `tests/agent-adapter.test.ts` -- Unit tests validating interface compliance and mock CLI execution

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/agent/agent.interface.ts` -- Define `AgentAdapter` interface
- [ ] `src/core/agent/adapters/antigravity.adapter.ts` -- Implement `AntigravityAdapter` running `agy` headlessly
- [ ] `src/core/agent/agent-factory.ts` -- Implement factory resolving provider from config
- [ ] `tests/agent-adapter.test.ts` -- Test adapter execution with mocked `SubprocessRunner`

**Acceptance Criteria:**
- Given the MBridge codebase, when the agent subsystem is defined, then it exports a TypeScript interface `AgentAdapter` requiring `name` (string) and `execute(params: { projectPath: string; prompt: string; timeoutMs?: number }): Promise<{ exitCode: number; durationMs: number; rawOutput: string }>`.
- Given a configured project specifying `agentProvider: antigravity`, when `AntigravityAdapter.execute()` is called, then it executes the Google Antigravity CLI (`agy`) with headless, non-interactive parameters, passes the user's prompt, and sets `cwd` to the project's canonical path, and executes through `SubprocessRunner` with `stdin: 'ignore'`, `CI=true`, and the 3-Tier Git Delivery Guard active.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
