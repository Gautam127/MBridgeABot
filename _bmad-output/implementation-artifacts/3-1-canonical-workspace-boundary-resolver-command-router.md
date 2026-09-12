---
title: 'Story 3.1: Canonical Workspace Boundary Resolver & Command Router'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Project aliases sent from mobile chat may have varying casing, paths may involve symlinks, and commands must never accidentally target or mutate MBridge's own installation directory.
**Approach:** Implement a command router normalizing project aliases case-insensitively and a workspace boundary resolver that canonicalizes project paths via `fs.realpathSync`, verifies folder existence, and strictly refuses any project resolving inside the bot directory.

## Boundaries & Constraints

**Always:**
- Normalize project aliases to lowercase (`alias.toLowerCase()`) when routing commands.
- Resolve canonical filesystem paths via `fs.realpathSync` to eliminate symlink traversal.
- Verify directory exists on disk; fail gracefully if missing.
- Strictly block execution if canonical path matches or resides within MBridge bot installation directory.

**Never:**
- Execute any command within MBridge's own repository directory.
- Allow case sensitivity to cause false "unknown project" errors.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed Case Alias | `/build MBridge` | Normalized to `mbridge`, routes cleanly | N/A |
| Target Path Inside Bot Directory | Configured project path inside MBridge repo | Blocked with security violation error | Return: `🚫 Security violation: project path cannot resolve to or inside the MBridge bot installation directory.` |
| Target Path Missing on Disk | Configured path points to non-existent folder | Fails before process spawn | Return descriptive directory not found error |

</frozen-after-approval>

## Code Map

- `src/bot/router/command-router.ts` -- Command text parser and case-insensitive project alias extractor
- `src/core/boundary/workspace-boundary.ts` -- Canonical path resolver and bot root safety validator
- `tests/workspace-boundary.test.ts` -- Unit tests for path canonicalization, bot directory rejection, and alias routing

## Tasks & Acceptance

**Execution:**
- [ ] `src/bot/router/command-router.ts` -- Implement case-insensitive project alias parser
- [ ] `src/core/boundary/workspace-boundary.ts` -- Implement `resolveAndValidate(projectPath)` with `fs.realpathSync` and bot root check
- [ ] `tests/workspace-boundary.test.ts` -- Test alias normalization, non-existent folder errors, and bot root protection

**Acceptance Criteria:**
- Given an incoming command string (e.g. `/build MBridge` or `/git WEBAPP pull`), when the command router parses the text, then it normalizes the project alias to lowercase (`alias.toLowerCase()`) and matches it against configured projects in `projects.yaml`.
- Given a configured project path (e.g. `d:/Gautam/MBridgeABot/MBridgeABot`), when the workspace boundary resolver validates the project, then it uses `fs.realpathSync` to resolve symbolic links and determine the true canonical filesystem directory, and verifies that the directory exists on disk, failing with a descriptive error if missing.
- Given any project whose canonical path matches or resides inside the MBridge bot root directory, when workspace boundary validation runs, then MBridge strictly refuses execution with an error: `🚫 Security violation: project path cannot resolve to or inside the MBridge bot installation directory.`

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
