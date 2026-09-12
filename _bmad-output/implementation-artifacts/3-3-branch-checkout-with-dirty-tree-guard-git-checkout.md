---
title: 'Story 3.3: Branch Checkout with Dirty Tree Guard (/git checkout)'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Switching Git branches remotely risks clobbering uncommitted local edits or producing messy checkout merge conflicts.
**Approach:** Implement `/git <project> checkout <branch>` with an automated pre-flight guard that runs `git status --porcelain` and strictly refuses execution if the working tree has uncommitted modifications.

## Boundaries & Constraints

**Always:**
- Run `git status --porcelain` before executing branch switch.
- If working tree has modified, deleted, or untracked files, abort immediately with dirty tree notice.
- If working tree is clean, execute `git checkout <branch>` and confirm active branch with next hints.

**Never:**
- Call `git checkout` when `git status --porcelain` contains any modifications.
- Force switch branches (`-f`) or discard user work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean Tree Checkout | Working tree clean, target branch exists | Branch switched, Telegram confirms new branch | N/A |
| Dirty Tree Checkout | Uncommitted files in working tree | Aborted: `⚠️ Cannot checkout branch "<branch>": working tree on project "<project>" has uncommitted modifications...` | Checkout never executed |
| Non-Existent Branch | Branch name not found | Reports Git branch error cleanly | N/A |

</frozen-after-approval>

## Code Map

- `src/bot/handlers/git.ts` -- `/git checkout` subcommand routing
- `src/core/git/git-service.ts` -- Status inspection (`isClean`) and branch checkout executor
- `tests/git-checkout.test.ts` -- Unit tests for dirty working tree abort and clean checkout

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/git/git-service.ts` -- Implement `checkoutBranch(projectPath, branch)` with porcelain pre-flight
- [ ] `src/bot/handlers/git.ts` -- Add `checkout` subcommand handling to `/git`
- [ ] `tests/git-checkout.test.ts` -- Test dirty working tree refusal and clean branch switch

**Acceptance Criteria:**
- Given an authorized user sends `/git <project> checkout <branch>`, when MBridge prepares to execute the checkout, then it runs `git status --porcelain` as a pre-flight guard.
- Given `git status --porcelain` returns one or more modified, deleted, or untracked files, when the pre-flight check evaluates the output, then MBridge immediately aborts the checkout without calling `git checkout`, and replies: `⚠️ Cannot checkout branch "<branch>": working tree on project "<project>" has uncommitted modifications. Please review and commit or stash at your desk.`
- Given the working tree is clean, when `git checkout <branch>` executes, then MBridge executes the checkout via `SubprocessRunner`, notifies Telegram of the active branch, and appends `Next: /build <project> or /test <project>`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
