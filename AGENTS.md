# Agent Operating Guidelines & Rules

## Strict Git Invariant (Human-in-the-Loop)
- **NEVER perform automatic Git mutations**: Under no circumstances should any agent automatically run `git add`, `git commit`, `git push`, `git checkout`, `git switch`, `git reset`, or any mutating Git command.
- **Developer Owns Git Delivery**: The human developer has full and exclusive ownership over staging, commits, branches, and remote interactions.
- **Workflow Completion Boundary**: When finishing an implementation, story, or feature (e.g. in `bmad-build` or any workflow), agents must stop after writing code and verifying tests. Do not stage or commit files. Present the changes and leave Git state entirely in the developer's hands.
