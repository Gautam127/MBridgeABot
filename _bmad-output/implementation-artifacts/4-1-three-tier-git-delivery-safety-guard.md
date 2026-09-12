---
title: 'Story 4.1: Three-Tier Git Delivery Safety Guard'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Autonomous AI coding agents or direct commands must never have the authority or ability to commit, push, merge, rebase, tag, or deploy code to remote repositories.
**Approach:** Implement a strict 3-tier defense boundary: (1) Primary PATH shim intercepting Git invocations and aborting mutating verbs with exit code 1; (2) Secondary `core.hooksPath` injection with abort hooks; (3) Tertiary push credential stripping (`GITHUB_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`).

## Boundaries & Constraints

**Always:**
- Prepend internal `bin/` directory to child `PATH` with platform-compatible Git wrapper (`git.bat`/`git.cmd` on Windows, executable script on POSIX).
- Intercept mutating verbs (`commit`, `push`, `merge`, `rebase`, `tag`, `publish`) and exit with code 1 without invoking real Git.
- Inject `core.hooksPath` pointing to pre-commit and pre-push hooks that unconditionally exit with code 1.
- Delete `GITHUB_TOKEN`, `GH_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, and credential helpers from child process environment.

**Never:**
- Allow any autonomous agent process to succeed in committing, pushing, or altering Git history.
- Pass Git push credentials to child processes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Agent Tries `git commit` | Child invokes `git commit -m "msg"` | Aborted immediately with exit code 1 | Message: `[MBridge Git Guard] Mutating Git verb is strictly forbidden` |
| Agent Tries `git push` | Child invokes `git push origin main` | Aborted immediately with exit code 1 | Security violation logged |
| Safe Git Command | Child invokes `git status` or `git diff` | Allowed to pass through to real Git binary | Normal stdout/stderr |

</frozen-after-approval>

## Code Map

- `src/core/git/guard/git-guard.ts` -- 3-tier defense setup and environment filter
- `src/core/git/guard/bin/` -- Git wrapper shims (`git.cmd`, `git.bat`, `git` shell script)
- `src/core/git/guard/hooks/` -- Pre-commit and pre-push abort hooks
- `tests/git-guard.test.ts` -- Unit tests validating 100% block rate on mutating verbs and pass-through on read-only verbs

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/git/guard/bin/` -- Create platform Git shims aborting `commit`, `push`, `merge`, `rebase`, `tag`, `publish`
- [ ] `src/core/git/guard/hooks/` -- Create pre-commit and pre-push hook scripts that exit with code 1
- [ ] `src/core/git/guard/git-guard.ts` -- Implement `applyGuard(env, projectPath)` setting PATH, hooks, and stripping credentials
- [ ] `tests/git-guard.test.ts` -- Test mutating verb blocks and read-only verb pass-through

**Acceptance Criteria:**
- Given an agent child process environment, when the environment is initialized, then an internal `bin/` directory is prepended to the system `PATH` containing a platform-compatible Git wrapper (`git.bat`/`git.cmd` on Windows, executable shell script on POSIX), and when invoked with mutating verbs (`commit`, `push`, `merge`, `rebase`, `tag`, `publish`), the shim immediately prints `[MBridge Git Guard] Mutating Git verb is strictly forbidden` and exits with code 1 without invoking the real Git binary.
- Given a project directory preparing for agent execution, when MBridge initializes the project boundary, then it configures `core.hooksPath` pointing to MBridge's hook directory containing executable `pre-commit` and `pre-push` hooks that exit with code 1, ensuring even absolute-path Git invocations are intercepted by Git itself.
- Given the environment variables prepared for the agent child process, when the environment is filtered, then `GITHUB_TOKEN`, `GH_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, and any custom Git credential helper variables are explicitly deleted from the child environment.
- Given an automated test suite executing commands in the guarded environment, when commands attempt `git commit -m "test"` or `git push origin main`, then 100% of attempts are aborted with exit code 1 and logged as security violations.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
