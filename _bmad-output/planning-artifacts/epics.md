---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-MBridgeABot-2026-09-10/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-MBridgeABot-2026-09-10/ARCHITECTURE-SPINE.md
  - docs/product-brief.md
---

# MBridgeABot - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for MBridgeABot, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Telegram User ID Allowlisting — System inspects sender Telegram User ID (`ctx.from.id`) on every update against `ALLOWED_USER_IDS`; drops unauthorized requests silently and logs an audit event.
FR-2: Explicit Project Command Dispatching — System parses text commands using explicit project aliases (e.g. `/<command> <project> [args]`), normalized case-insensitively.
FR-3: Strict Mutating Git Block at Execution Boundary — System strictly blocks and forbids `git commit`, `git push`, `git merge`, `git rebase`, `git tag`, and deployment commands via a 3-tier defense (primary PATH shim, secondary `core.hooksPath`, tertiary credential stripping).
FR-4: Explicit Human-Authorized Workspace Synchronization Operations — System provides `/git <project> <pull|checkout>` where `/git pull` executes `git pull --ff-only` (rejecting divergence without merge), and `checkout <branch>` strictly refuses execution if `git status --porcelain` is dirty.
FR-5: Project Resolution & Workspace Boundary — System resolves project aliases from `projects.yaml` using Zod validation, enforces canonical paths via `fs.realpathSync`, locks `cwd` to project directory, and prevents execution in bot root.
FR-6: Subprocess Execution, Project Concurrency Locks & Secret Sanitization — System executes commands via `execa` without shell evaluation (`shell: false`), enforces execution timeout (600s), serializes execution per project via exclusive lock, and strips secrets.
FR-7: Graceful Process Cancellation — System provides `/cancel <project>` command to terminate running child process trees via platform-native signaling (SIGTERM with 5s SIGKILL escalation).
FR-8: Project Build Command — System provides `/build <project>` executing configured build command from `projects.yaml` and returning batch completion notification with status, runtime, and failure excerpt.
FR-9: Project Test Command & Failure Reporting — System provides `/test <project>` executing configured test command and returning batch summary of passed/failed tests with terminal stack trace excerpt.
FR-10: Standard AgentAdapter Interface Contract — System defines uniform TypeScript interface (`execute({ projectPath, prompt }): Promise<{ exitCode, durationMs, rawOutput }>`) for coding agent providers.
FR-11: Antigravity CLI Adapter (v1) — System implements `AgentAdapter` for Google Antigravity CLI (`agy`), executing in non-interactive/headless mode with project-bounded workspace parameters.
FR-12: Post-Agent Git Diff & Impact Reporting — System runs `git status --porcelain` after agent completion and reports duration, modified/created files count, and diff inspection hint.
FR-13: [Deferred to Post-v1] Git Status & Diff Inspector — System provides `/diff <project>` executing `git status --short` and `git diff`, displaying formatted summary with line count notice and `.patch` document attachment fallback for large diffs. (Deferred to post-v1 per user direction; manual review performed at desk).
FR-14: System Status & Health — System provides `/status` reporting bot uptime, host OS, Node runtime, free memory, and mounted project list.
FR-15: Projects Registry List — System provides `/projects` listing configured project aliases, canonical paths, and agent providers from `projects.yaml`.
FR-16: Telegram Update Idempotency — System maintains an in-memory bounded LRU cache of recent `update_id`s (1,000 entries) to prevent duplicate execution of mutating/expensive commands on reconnection during process lifetime.
FR-17: Task Lifecycle State Machine & Correlation — System manages tasks through strict formal state enum (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`) with `RECOVERY_MODE` startup phase, assigning internal UUID v4 and 6-char hex display ID for Telegram correlation.

### NonFunctional Requirements

NFR-1 (Security / Git Invariant): 100% block rate on any attempted `commit`, `push`, `merge`, `rebase`, `tag`, or `deploy` from `/agent` or direct commands.
NFR-2 (Access Control): 0% information disclosure or command execution for non-allowlisted Telegram user IDs (100% silent drop).
NFR-3 (Execution Reliability): > 98% successful dispatch rate for configured commands without orphaned or unkillable background processes.
NFR-4 (Dispatch Latency): < 2.0s from sending command in Telegram to receiving initial `⏳ Running...` acknowledgment.
NFR-5 (Execution Timeout): Default 600s (10m) hard execution ceiling per task with automated process tree termination.
NFR-6 (Platform-Native Process Termination): Reliable process tree termination on Windows (`taskkill /F /T /PID <pid>`) and POSIX (`-pid` process group signaling).
NFR-7 (Tiered Secret Protection): Zero `.env` variable forwarding to child process environments; 100% redacting of bot tokens and detected secret patterns before emitting to Telegram or Pino logs.
NFR-8 (Telegram Formatting & Rate Limits): Telegram message ceiling of 3,500 characters with clean line-boundary truncation.
NFR-9 (Two-Layer Non-Interactive Execution): All subprocesses execute with `stdin: 'ignore'`, `CI=true`, and adapter-specific headless flags.
NFR-10 (Mobile Usability): Project aliases are case-insensitive (`alias.toLowerCase()`); textual `Next: /...` action hints appended to completion summaries.

### Additional Requirements

- Greenfield Node.js 20+ TypeScript project structure (`package.json`, `tsconfig.json`, strict type checking).
- AD-1 Primary Guard: Internal `bin/` directory prepended to child `PATH` with Git wrapper shim aborting mutating verbs with exit code 1.
- AD-1 Secondary Guard: Injected `core.hooksPath` pointing to pre-commit and pre-push abort hooks.
- AD-1 Tertiary Guard: Push credentials stripped (`GITHUB_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`).
- AD-2 Workspace Boundary: `fs.realpathSync` canonical path verification on boot; cwd locked to project path; explicit rejection of bot directory execution.
- AD-3 Process Ownership: `RuntimeProcessRegistry` tracking active task root PIDs and metadata.
- AD-4 Project Concurrency Lock: `ProjectLockManager` enforcing exclusive lock per project alias; independent projects run concurrently.
- AD-8 Process Recovery Invariant: `.mbridge/active-tasks.json` written on task launch; startup verification of process identity and start timestamp prior to terminating stale PIDs.
- AD-10 Idempotency Scope: In-memory LRU cache protects against duplicate updates during current process lifetime.
- AD-11 Formal State Machine: Tasks strictly transition `QUEUED` -> `RUNNING` -> (`COMPLETED` | `FAILED` | `CANCELLED` | `TIMED_OUT`).
- Task Correlation: UUID v4 internal ID + 6-char hex prefix display ID.
- Configurable Sleep Policy: `preventSystemSleep: boolean` (default `false`) in config; asserted only during `RUNNING` state; affects system sleep only, never screen.
- Bounded Output Retention: In-memory stream buffer enforcing `maxOutputBytes` (512 KB) and `maxRetainedLines` (1,000 lines), retaining head + tail diagnostics.

### UX Design Requirements

(None — MBridgeABot is a conversational Telegram bot and CLI control plane without a custom web or mobile graphical user interface).

### FR Coverage Map

- **FR-1**: Epic 1 - Telegram User ID Allowlisting (silent drop middleware)
- **FR-2**: Epic 3 - Explicit Project Command Dispatching (normalized case-insensitive routing)
- **FR-3**: Epic 4 - Strict Mutating Git Block at Execution Boundary (3-tier defense)
- **FR-4**: Epic 3 - Explicit Human-Authorized Workspace Synchronization (`/git pull --ff-only`, `/git checkout` with dirty guard)
- **FR-5**: Epic 3 - Project Resolution & Workspace Boundary (`fs.realpathSync`, bot-root guard)
- **FR-6**: Epic 2 - Subprocess Execution, Project Concurrency Locks & Secret Sanitization (`execa`, `ProjectLockManager`, `SecretSanitizer`)
- **FR-7**: Epic 2 - Graceful Process Cancellation (`/cancel`, `ProcessTreeManager`, platform-native kill)
- **FR-8**: Epic 2 - Project Build Command (`/build <project>`)
- **FR-9**: Epic 2 - Project Test Command & Failure Reporting (`/test <project>`)
- **FR-10**: Epic 4 - Standard AgentAdapter Interface Contract (`AgentAdapter` TypeScript interface)
- **FR-11**: Epic 4 - Antigravity CLI Adapter (v1) (`agy` headless invocation)
- **FR-12**: Epic 4 - Post-Agent Git Diff & Impact Reporting (`git status --porcelain` summary metrics)
- **FR-13**: [Deferred to Post-v1] Git Status & Diff Inspector (manual desk review for v1)
- **FR-14**: Epic 1 - System Status & Health (`/status` telemetry)
- **FR-15**: Epic 1 - Projects Registry List (`/projects` listing)
- **FR-16**: Epic 1 - Telegram Update Idempotency (LRU cache of `update_id`s)
- **FR-17**: Epic 2 - Task Lifecycle State Machine & Correlation (formal state enum, recovery, UUID/display ID)

## Epic List

### Epic 1: Workstation Access & Project Registry
Securely connect to MBridge from an authorized Telegram account, verify host workstation health, and list configured project workspaces.
**FRs covered:** FR-1, FR-14, FR-15, FR-16

### Epic 2: Project Execution & Process Control Engine
Trigger build and test suites on workstation projects remotely, enforce exclusive concurrency locks, redact sensitive secrets, receive bounded diagnostic summaries, and reliably cancel running process trees.
**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-17

### Epic 3: Safe Workspace Synchronization & Boundary Control
Enforce canonical workspace boundaries on configured projects, safely synchronize upstream branches via fast-forward-only pull, and switch branches with dirty-tree protection.
**FRs covered:** FR-2, FR-4, FR-5

### Epic 4: Autonomous Agent Execution with Guarded Git Delivery
Delegate implementation tasks to an autonomous coding agent (Google Antigravity CLI) under an ironclad 3-tier Git delivery guard that strictly prevents committing, pushing, merging, or deploying code, followed by automated change impact reporting.
**FRs covered:** FR-3, FR-10, FR-11, FR-12

## Epic 1: Workstation Access & Project Registry

Securely connect to MBridge from an authorized Telegram account, verify host workstation health, and list configured project workspaces.

### Story 1.1: Project Bootstrap & Telegram Connection with Silent-Drop Allowlist

As an authorized developer,
I want to start the MBridge bot on my workstation and have it silently drop any messages from unauthorized Telegram users,
So that my private workstation bridge is connected to Telegram and impenetrable to unauthorized interactions.

**Acceptance Criteria:**

**Given** an empty `backend/` directory,
**When** the project is initialized,
**Then** `backend/package.json` and `backend/tsconfig.json` configure a modern Node.js 20+ ES module project with strict TypeScript checking, `grammY` for Telegram bot connectivity, `pino` for structured logging, and `dotenv` for configuration loading.
**And** with `ALLOWED_USER_IDS="12345678,87654321"` configured in `backend/.env`,
**When** a Telegram update arrives from an unauthorized user ID (e.g. `ctx.from.id = 99999999`),
**Then** the allowlist middleware silently drops the update without sending any reply or acknowledgment to Telegram,
**And** logs a structured `WARN` security audit event in Pino containing the unauthorized user ID, timestamp, and attempted message text.
**Given** a Telegram update from an authorized user ID (`ctx.from.id = 12345678`),
**When** the update reaches the allowlist middleware,
**Then** the request is permitted to proceed to downstream command handlers,
**And** the bot responds with a basic greeting/status acknowledgment when `/ping` is sent.

### Story 1.2: Telegram Update Idempotency Filter

As an authorized developer,
I want MBridge to deduplicate re-delivered Telegram updates during network blips or long-polling reconnects,
So that my workstation never executes duplicate commands unintentionally.

**Acceptance Criteria:**

**Given** an in-memory bounded LRU cache initialized with a capacity of 1,000 entries,
**When** a Telegram update arrives with an `update_id` that has not been seen during the current process lifetime,
**Then** the `update_id` is recorded in the cache, and the update is passed to downstream handlers.
**Given** a Telegram update arrives with an `update_id` already present in the LRU cache,
**When** the idempotency middleware evaluates the update,
**Then** the update is dropped immediately without executing downstream handlers,
**And** a `DEBUG` log event is recorded noting the duplicate `update_id` was ignored.

### Story 1.3: Workstation Telemetry & System Status Command

As an authorized developer,
I want to send `/status` from my phone,
So that I can verify that MBridge is online and view my workstation's host OS, runtime uptime, and available memory.

**Acceptance Criteria:**

**Given** an authorized user messages the bot,
**When** the user sends `/status`,
**Then** MBridge replies within 2.0s with a clean, Markdown-formatted telemetry message containing:
- Bot process uptime,
- Host platform & OS release,
- Node.js runtime version,
- Free and total system RAM in GB,
- Total count of mounted projects loaded from `projects.yaml`.
**And** the message concludes with a textual next-step hint (e.g., `Next: /projects`).

### Story 1.4: Projects Configuration Loader & Registry Command

As an authorized developer,
I want MBridge to load my project definitions from `projects.yaml` and list them when I send `/projects`,
So that I can see all mounted project workspaces and their aliases directly on my phone.

**Acceptance Criteria:**

**Given** a `projects.yaml` configuration file at bot root,
**When** the bot starts up,
**Then** the configuration is validated against a Zod schema requiring `alias` (string), `path` (string), `buildCmd` (string), `testCmd` (string), and `agentProvider` (string),
**And** all project aliases are normalized to lowercase (`alias.toLowerCase()`) so they can be queried case-insensitively.
**Given** one or more valid projects configured in `projects.yaml`,
**When** an authorized user sends `/projects`,
**Then** MBridge replies with a formatted list of all registered projects showing alias, path, and agent provider,
**And** appends a next-action hint (e.g., `Next: /build <alias> or /test <alias>`).
**Given** `projects.yaml` is missing or fails Zod validation on boot,
**When** MBridge initializes,
**Then** the bot logs a descriptive fatal error pointing out the exact Zod validation failures and refuses to start with invalid configuration.

## Epic 2: Project Execution & Process Control Engine

Trigger build and test suites on workstation projects remotely, enforce exclusive concurrency locks, redact sensitive secrets, receive bounded diagnostic summaries, and reliably cancel running process trees.

### Story 2.1: Task State Machine, Correlation & Startup Recovery

As an authorized developer,
I want MBridge to track every execution task through a formal lifecycle state machine and clean up any orphaned processes upon bot restart,
So that task executions have unambiguous status and workstation reboots never leave zombie processes behind.

**Acceptance Criteria:**

**Given** a new execution request,
**When** the task is instantiated,
**Then** it is assigned an internal UUID v4 and a 6-character hex display ID (e.g. `3a8f12`),
**And** transitions strictly through the formal enum: `QUEUED` -> `RUNNING` -> (`COMPLETED` | `FAILED` | `CANCELLED` | `TIMED_OUT`).
**Given** a task transitions to `RUNNING`,
**When** the child process is spawned,
**Then** MBridge writes/updates `.mbridge/active-tasks.json` recording `taskId`, `displayId`, `projectAlias`, `rootPid`, `command`, and `startedAt`,
**And** removes or marks the entry terminal upon task completion.
**Given** MBridge starts up and discovers an existing `.mbridge/active-tasks.json` with active entries,
**When** the `RECOVERY_MODE` system phase executes,
**Then** it inspects each recorded PID, verifies process identity and start timestamp against OS process tables, terminates any verified orphaned child trees, marks the recorded tasks as `FAILED` (reason: `SERVER_RESTARTED`), and clears the active tasks file.

### Story 2.2: Concurrency Lock Manager & Secret Sanitizer

As an authorized developer,
I want MBridge to enforce exclusive execution locks per project and scrub sensitive tokens from all outputs,
So that simultaneous commands cannot corrupt project state and secrets are never leaked into Telegram chats.

**Acceptance Criteria:**

**Given** an execution task is running on project alias `mbridge`,
**When** a second command (`/build`, `/test`, or `/agent`) is received for `mbridge`,
**Then** `ProjectLockManager` rejects the second request immediately with a 409 conflict message: `⚠️ Project "mbridge" is busy running task [3a8f12]. Use /cancel mbridge to abort it first.`,
**And** permits commands targeting independent project aliases to acquire their respective locks and run concurrently.
**Given** a task finishes, fails, times out, or is cancelled,
**When** the execution pipeline terminates,
**Then** `ProjectLockManager.release(alias)` is guaranteed to execute via a `try...finally` block, ensuring no project remains permanently locked.
**Given** any command stdout, stderr, exception trace, or log output,
**When** processed by `SecretSanitizer`,
**Then** the `TELEGRAM_BOT_TOKEN`, configured project secrets, and standard token patterns (e.g. `ghp_[A-Za-z0-9]+`, Bearer tokens) are replaced with `[REDACTED]` prior to sending to Telegram or writing to logs.

### Story 2.3: Subprocess Runner & Platform-Native Process Tree Manager

As an authorized developer,
I want MBridge to spawn commands with non-interactive flags, bounded stream memory, hard timeouts, and reliable process tree termination,
So that subprocesses never hang waiting for input, exhaust memory, or escape termination.

**Acceptance Criteria:**

**Given** an execution command,
**When** `SubprocessRunner` spawns the child process via `execa`,
**Then** it runs with `shell: false`, `stdin: 'ignore'`, and environment variables `CI=true` and `FORCE_COLOR=0`,
**And** MBridge's own `.env` variables are completely omitted from the child process environment.
**Given** a subprocess emitting high-volume stdout/stderr,
**When** streaming output,
**Then** the in-memory stream buffer retains a maximum of 512 KB (`maxOutputBytes`) and 1,000 lines (`maxRetainedLines`), preserving the initial head lines and trailing tail lines with a truncation notice if limits are exceeded.
**Given** a running subprocess that exceeds the 600s (10m) execution ceiling,
**When** the timeout fires,
**Then** `SubprocessRunner` triggers `ProcessTreeManager` termination, marks the task `TIMED_OUT`, and notifies Telegram with `⏱️ Task [3a8f12] timed out after 10m and was terminated.`
**Given** a running process tree with root PID,
**When** `ProcessTreeManager.kill(pid)` is called,
**Then** on Windows it executes `taskkill /F /T /PID <pid>`, and on POSIX it sends `SIGTERM` to the process group (`-pid`) followed by `SIGKILL` escalation after 5s if still active.

### Story 2.4: Project Build & Test Commands with Bounded Telegram Reporting

As an authorized developer,
I want to run `/build <project>` and `/test <project>` from Telegram,
So that I can trigger builds and test suites on my workstation and receive immediate acknowledgment followed by structured results on my phone.

**Acceptance Criteria:**

**Given** an authorized user sends `/build <project>` or `/test <project>`,
**When** the command is validated,
**Then** MBridge replies within 2.0s with `⏳ Running build on <project> [task: 3a8f12]...` (or `test`).
**Given** a valid project alias,
**When** the task executes,
**Then** it executes `buildCmd` (for `/build`) or `testCmd` (for `/test`) configured in `projects.yaml` inside the project's directory.
**Given** the command completes,
**When** MBridge formats the Telegram notification,
**Then** it sends a single batch message with status (`✅ Build succeeded` or `❌ Build failed`), duration in seconds, and tail log diagnostics if failed,
**And** the entire message is strictly bounded under 3,500 characters, truncated at a clean newline with a notice `[Output truncated. Full logs retained on workstation.]`,
**And** appends a next-action hint (e.g., `Next: /test <project>`).

### Story 2.5: Process Cancellation Command (/cancel)

As an authorized developer,
I want to send `/cancel <project>` from Telegram,
So that I can immediately abort a running build or test on my workstation and free up the project lock.

**Acceptance Criteria:**

**Given** a task `[3a8f12]` is currently `RUNNING` on project `webapp`,
**When** the user sends `/cancel webapp`,
**Then** MBridge immediately calls `ProcessTreeManager` to terminate the process tree,
**And** transitions the task state to `CANCELLED`, releases the project lock, and replies `🛑 Task [3a8f12] on "webapp" has been cancelled.`
**Given** no task is currently active on project `webapp`,
**When** the user sends `/cancel webapp`,
**Then** MBridge replies `ℹ️ No active task running on project "webapp".`

## Epic 3: Safe Workspace Synchronization & Boundary Control

Enforce canonical workspace boundaries on configured projects, safely synchronize upstream branches via fast-forward-only pull, and switch branches with dirty-tree protection.

### Story 3.1: Canonical Workspace Boundary Resolver & Command Router

As an authorized developer,
I want MBridge to resolve project aliases case-insensitively and verify their canonical filesystem paths before running commands,
So that commands always execute in the intended project directory and can never target the bot's own installation folder.

**Acceptance Criteria:**

**Given** an incoming command string (e.g. `/build MBridge` or `/git WEBAPP pull`),
**When** the command router parses the text,
**Then** it normalizes the project alias to lowercase (`alias.toLowerCase()`) and matches it against configured projects in `projects.yaml`.
**Given** a configured project path (e.g. `d:/Gautam/MBridgeABot/MBridgeABot`),
**When** the workspace boundary resolver validates the project,
**Then** it uses `fs.realpathSync` to resolve symbolic links and determine the true canonical filesystem directory,
**And** verifies that the directory exists on disk, failing with a descriptive error if missing.
**Given** any project whose canonical path matches or resides inside the MBridge bot root directory,
**When** workspace boundary validation runs,
**Then** MBridge strictly refuses execution with an error: `🚫 Security violation: project path cannot resolve to or inside the MBridge bot installation directory.`

### Story 3.2: Safe Fast-Forward Workspace Synchronization (/git pull)

As an authorized developer,
I want to run `/git <project> pull` from Telegram,
So that I can safely synchronize my workstation project with upstream branches using fast-forward only, without creating merge commits or rebasing.

**Acceptance Criteria:**

**Given** an authorized user sends `/git <project> pull`,
**When** MBridge validates the project and acquires the project lock,
**Then** it dispatches `git pull --ff-only` through `SubprocessRunner` with `cwd` locked to the project's canonical path.
**Given** the remote branch can be fast-forwarded or is already up to date,
**When** `git pull --ff-only` completes with exit code 0,
**Then** MBridge sends a summary notification with duration, updated commit range/status, and appends `Next: /test <project>`.
**Given** the local branch has diverged from upstream and cannot be fast-forwarded,
**When** `git pull --ff-only` exits with a non-zero code due to divergence,
**Then** MBridge catches the exit code and replies: `⚠️ Fast-forward rejected: remote branch has diverged. No merge or rebase was performed. Please synchronize manually at your desk.`,
**And** releases the project lock safely.

### Story 3.3: Branch Checkout with Dirty Tree Guard (/git checkout)

As an authorized developer,
I want to switch Git branches remotely using `/git <project> checkout <branch>`,
So that I can switch contexts safely, with guaranteed protection against clobbering any uncommitted changes.

**Acceptance Criteria:**

**Given** an authorized user sends `/git <project> checkout <branch>`,
**When** MBridge prepares to execute the checkout,
**Then** it runs `git status --porcelain` as a pre-flight guard.
**Given** `git status --porcelain` returns one or more modified, deleted, or untracked files,
**When** the pre-flight check evaluates the output,
**Then** MBridge immediately aborts the checkout without calling `git checkout`,
**And** replies: `⚠️ Cannot checkout branch "<branch>": working tree on project "<project>" has uncommitted modifications. Please review and commit or stash at your desk.`
**Given** the working tree is clean,
**When** `git checkout <branch>` executes,
**Then** MBridge executes the checkout via `SubprocessRunner`, notifies Telegram of the active branch, and appends `Next: /build <project> or /test <project>`.

## Epic 4: Autonomous Agent Execution with Guarded Git Delivery

Delegate implementation tasks to an autonomous coding agent (Google Antigravity CLI) under an ironclad 3-tier Git delivery guard that strictly prevents committing, pushing, merging, or deploying code, followed by automated change impact reporting.

### Story 4.1: Three-Tier Git Delivery Safety Guard

As an authorized developer,
I want MBridge to enforce a 3-tier defense boundary whenever an agent process is spawned,
So that no autonomous agent can ever commit, push, merge, rebase, tag, or publish code to my remote repositories.

**Acceptance Criteria:**

**Given** an agent child process environment,
**When** the environment is initialized,
**Then** an internal `bin/` directory is prepended to the system `PATH` containing a platform-compatible Git wrapper (`git.bat`/`git.cmd` on Windows, executable shell script on POSIX),
**And** when invoked with mutating verbs (`commit`, `push`, `merge`, `rebase`, `tag`, `publish`), the shim immediately prints `[MBridge Git Guard] Mutating Git verb is strictly forbidden` and exits with code 1 without invoking the real Git binary.
**Given** a project directory preparing for agent execution,
**When** MBridge initializes the project boundary,
**Then** it configures `core.hooksPath` pointing to MBridge's hook directory containing executable `pre-commit` and `pre-push` hooks that exit with code 1, ensuring even absolute-path Git invocations are intercepted by Git itself.
**Given** the environment variables prepared for the agent child process,
**When** the environment is filtered,
**Then** `GITHUB_TOKEN`, `GH_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`, and any custom Git credential helper variables are explicitly deleted from the child environment.
**Given** an automated test suite executing commands in the guarded environment,
**When** commands attempt `git commit -m "test"` or `git push origin main`,
**Then** 100% of attempts are aborted with exit code 1 and logged as security violations.

### Story 4.2: Standard AgentAdapter Contract & Antigravity CLI Provider

As an authorized developer,
I want MBridge to define a standard `AgentAdapter` interface and implement an adapter for Google Antigravity CLI (`agy`),
So that MBridge can invoke Antigravity non-interactively within the project workspace.

**Acceptance Criteria:**

**Given** the MBridge codebase,
**When** the agent subsystem is defined,
**Then** it exports a TypeScript interface `AgentAdapter` requiring `name` (string) and `execute(params: { projectPath: string; prompt: string; timeoutMs?: number }): Promise<{ exitCode: number; durationMs: number; rawOutput: string }>`.
**Given** a configured project specifying `agentProvider: antigravity`,
**When** `AntigravityAdapter.execute()` is called,
**Then** it executes the Google Antigravity CLI (`agy`) with headless, non-interactive parameters, passes the user's prompt, and sets `cwd` to the project's canonical path,
**And** executes through `SubprocessRunner` with `stdin: 'ignore'`, `CI=true`, and the 3-Tier Git Delivery Guard active.

### Story 4.3: Autonomous Agent Dispatch & Change Impact Reporting (/agent)

As an authorized developer,
I want to send `/agent <project> <prompt>` from Telegram,
So that I can delegate coding tasks to Antigravity on my workstation and receive immediate acknowledgment followed by an automated file change summary upon completion.

**Acceptance Criteria:**

**Given** an authorized user sends `/agent <project> <prompt>`,
**When** the command is received and project lock acquired,
**Then** MBridge replies within 2.0s with `⏳ Delegating task to Antigravity on <project> [task: 3a8f12]...`.
**Given** the agent finishes execution (succeeded or failed),
**When** MBridge handles the completion lifecycle,
**Then** it runs `git status --porcelain` in the project directory to calculate the impact,
**And** parses the output to determine total files modified, created, and deleted.
**Given** the impact metrics are calculated,
**When** MBridge sends the completion notification to Telegram,
**Then** it delivers a concise summary:
- Task status (`✅ Agent completed` or `❌ Agent exited with code <N>`),
- Total execution time in seconds,
- File change breakdown (e.g. `📝 3 files modified, 1 file created`),
- Advisory next-step hint: `Ready for desk review. Use /test <project> to verify.`





