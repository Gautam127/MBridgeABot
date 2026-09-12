---
title: 'Story 3.2: Safe Fast-Forward Workspace Synchronization (/git pull)'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Remote git pull operations risk creating unwanted merge commits, rebases, or conflict states while away from the workstation desk.
**Approach:** Implement `/git <project> pull` enforcing `git pull --ff-only` with `cwd` locked to the project's canonical path, strictly rejecting diverged branches without merging or rebasing.

## Boundaries & Constraints

**Always:**
- Execute `git pull --ff-only` strictly inside project canonical directory with acquired lock.
- If upstream fast-forwards or is up-to-date, report success with updated commit range and duration.
- If branches diverged and cannot be fast-forwarded, immediately reject and report divergence warning.
- Append next hint (e.g. `Next: /test <project>`).

**Never:**
- Perform automatic 3-way merge commits or rebasing.
- Release locks in an unhandled failure state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean Fast-Forward | Remote has new commits, local is clean | Pull succeeds, reports updated commits, next hint | N/A |
| Already Up to Date | Remote and local match | `Already up to date` notification | N/A |
| Diverged Branches | Local and remote have conflicting commits | Pull rejected: `⚠️ Fast-forward rejected: remote branch has diverged...` | Non-zero exit code caught, lock released safely |

</frozen-after-approval>

## Code Map

- `src/bot/handlers/git.ts` -- `/git` subcommands router
- `src/core/git/git-service.ts` -- Fast-forward pull executor and status inspection
- `tests/git-pull.test.ts` -- Unit tests for clean pull, divergence rejection, and lock lifecycle

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/git/git-service.ts` -- Implement `pullFastForward(projectPath)`
- [ ] `src/bot/handlers/git.ts` -- Add `pull` subcommand to `/git` handler
- [ ] `tests/git-pull.test.ts` -- Test fast-forward success and divergence rejection behavior

**Acceptance Criteria:**
- Given an authorized user sends `/git <project> pull`, when MBridge validates the project and acquires the project lock, then it dispatches `git pull --ff-only` through `SubprocessRunner` with `cwd` locked to the project's canonical path.
- Given the remote branch can be fast-forwarded or is already up to date, when `git pull --ff-only` completes with exit code 0, then MBridge sends a summary notification with duration, updated commit range/status, and appends `Next: /test <project>`.
- Given the local branch has diverged from upstream and cannot be fast-forwarded, when `git pull --ff-only` exits with a non-zero code due to divergence, then MBridge catches the exit code and replies: `⚠️ Fast-forward rejected: remote branch has diverged. No merge or rebase was performed. Please synchronize manually at your desk.`, and releases the project lock safely.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
