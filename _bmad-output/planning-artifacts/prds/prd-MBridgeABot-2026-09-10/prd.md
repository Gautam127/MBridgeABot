---
title: MBridgeABot
status: draft
created: 2026-09-10
updated: 2026-09-10
---

# PRD: MBridgeABot

*Human-in-the-Loop Remote AI Dev Assistant & Workstation Bridge*

## 0. Document Purpose

This Product Requirements Document (PRD) defines the requirements, safety guardrails, command interfaces, and system architecture for **MBridgeABot**. It serves as the authoritative source of truth for downstream implementation workflows (Architecture design with Winston, Epic/Story breakdown, and automated development). This PRD expands on the initial seed brief located at `docs/product-brief.md`, formalizing the security threat model, user journeys, functional requirements (FRs), and operational constraints for a solo developer workflow.

---

## 1. Vision

Modern developers frequently leverage local CLI-based AI coding agents (such as Google Antigravity CLI, Claude CLI, or Codex/Aider) to prototype features and resolve codebase issues. However, utilizing these agents currently binds the developer physically to their desk: the developer must sit and wait while the agent reads files, iterates, and executes tasks. Furthermore, when away from the workstation (during commutes, breaks, or off-hours), discovering a broken branch or receiving a new task requires reopening a laptop and setting up the environment manually.

**MBridgeABot** bridges this gap by connecting developers directly to their local development workstation through a private Telegram bot interface. Operating under a strict **Least-Privilege Security Model**, MBridgeABot allows the developer to remotely inspect git diffs, dispatch AI coding agents, run builds, and trigger test suites from mobile or desktop chat.

Crucially, MBridgeABot operates on an uncompromising **Human-in-the-Loop Git Delivery** philosophy: it completely forbids autonomous `commit`, `push`, `merge`, and `deploy` actions. AI agents are granted zero git mutation privileges. The developer retains 100% control over the git history, enabling productive asynchronous work away from the desk without risking repo integrity or system security.

---

## 2. Target User & Jobs To Be Done

### 2.1 Jobs To Be Done (JTBD)

- **Away-from-Desk Conflict & Bug Repair (Functional & Contextual)**: When a teammate pushes changes that break my local workspace while I am away from my desk, I want to remotely trigger a `git pull`, dispatch an AI agent to resolve the issue, and execute tests, so that fixed changes are waiting cleanly in my working tree when I return.
- **Asynchronous Feature Incubation (Functional & Temporal)**: When an issue or feature is assigned to me, I want to dispatch an AI coding agent from my phone to build the initial implementation while I take a break, so that I don't waste time watching terminal output generate line-by-line.
- **Remote Workspace Verification (Observability)**: When away from my computer, I want to quickly inspect `git status`, view concise `git diff` outputs, and check workstation health without establishing an unencrypted or complex remote desktop/SSH session.
- **Strong Remote Assurance (Emotional)**: I want strong assurance that remote prompts and AI agents cannot push changes, alter Git history, or operate outside authorized project boundaries.

### 2.2 Non-Users (v1)

- **Multi-Tenant Engineering Teams**: v1 is calibrated strictly as a personal/solo developer tool. It does not provide role-based access control (RBAC), multi-user quotas, or shared credential isolation.
- **Automated CI/CD / Release Pipelines**: MBridgeABot is not a deployment runner or webhook-triggered build bot. Mutating releases and deployments are explicitly forbidden.
- **Public Chatbot Users**: The bot is closed to the public and immediately drops traffic from non-allowlisted Telegram user IDs.

### 2.3 Key User Journeys

- **UJ-1. Gautam pulls updates and tasks an agent to fix a conflict while away from his desk**
  - **Persona + Context**: Gautam, a software engineer, is having lunch away from his desk. A colleague pushes updates to a shared repository that introduce a regression.
  - **Entry state**: Authenticated via Telegram on mobile (User ID matched against `.env`). Bot running locally on workstation.
  - **Path**:
    1. Gautam sends `/git ecommerce pull`.
    2. Bot verifies the request, executes `git pull` inside `D:/Projects/ecommerce`, and replies: `✅ Git pull completed successfully (4 files updated)`.
    3. Gautam sends `/test ecommerce`. The test suite fails. Bot responds with: `❌ Tests failed (2 tests failed)` with a concise error excerpt.
    4. Gautam sends `/agent ecommerce Fix the failing auth tests caused by the recent pull`.
    5. Bot acknowledges: `⏳ Dispatched Antigravity agent on ecommerce...`.
    6. Agent iterates inside the project folder. Once finished, the bot sends: `✅ Agent task completed (Duration: 1m 45s, 2 files modified). Use /diff ecommerce to inspect.`
    7. Gautam sends `/test ecommerce`. Tests pass (`✅ All 18 tests passed`).
  - **Climax**: Gautam returns to his desk knowing the problem is solved and code is ready for final human review.
  - **Resolution**: Gautam sits down at his desk, reviews the clean working tree with `git diff`, and manually commits and pushes.
  - **Edge case**: If the agent attempts to run `git commit` or `git push` during its task, the command runner blocks the operation instantly, records a security event, and prevents any upstream mutation.

- **UJ-2. Remote Feature Prototyping**
  - **Persona + Context**: Gautam receives a quick feature request while commuting.
  - **Entry state**: Mobile Telegram client, allowlisted user.
  - **Path**:
    1. Gautam sends `/agent billing-api Scaffold a new invoice export endpoint with unit tests`.
    2. Bot validates project alias `billing-api`, binds cwd to `D:/Projects/billing-api`, and executes `agy`.
    3. On completion, bot responds with duration, modified files count, and brief diff summary.
    4. Gautam sends `/build billing-api` to ensure compilation succeeds.
  - **Climax**: Gautam receives `✅ Build succeeded in 12s`.
  - **Resolution**: Workspace is ready for desk verification.

- **UJ-3. Unauthorized Stranger Attempts Interaction**
  - **Persona + Context**: An unknown Telegram user discovers the bot username and attempts to send `/status` or `/build`.
  - **Entry state**: Unauthenticated Telegram User ID.
  - **Path**: User ID is checked against `ALLOWED_USER_IDS` in `.env`.
  - **Climax**: Message is immediately dropped. No reply is sent to Telegram to prevent discovery.
  - **Resolution**: A security warning is logged locally in Pino logger with user metadata.

- **UJ-4. Process Timeout and Graceful Cancellation**
  - **Persona + Context**: Gautam dispatches an agent task that gets stuck in a loop or a build that hangs.
  - **Entry state**: Mobile Telegram client, active long-running process.
  - **Path**:
    1. Gautam notices the task is taking too long and sends `/cancel ecommerce`.
    2. Bot locates the active child process group for `ecommerce` and transmits `SIGTERM` (followed by `SIGKILL` if unresponsive within 5 seconds).
  - **Climax**: Bot replies: `🛑 Successfully terminated process for project: ecommerce`.
  - **Resolution**: Workstation resources are freed immediately.

---

## 3. Glossary

- **MBridgeABot**: The Node.js application acting as the control plane between Telegram and the local workstation.
- **Workstation**: The developer's physical or local machine where code, compilers, toolchains, and AI CLIs reside.
- **Project Alias**: A unique identifier (e.g. `ecommerce`, `billing-api`) mapped in `projects.yaml` to an absolute workstation directory path and toolchain commands.
- **AgentAdapter**: The pluggable TypeScript interface abstracting interactions with local AI coding CLIs (e.g. Antigravity CLI, Claude CLI).
- **Git Guard**: The security layer enforcing Git safety invariants, strictly rejecting mutating verbs (`commit`, `push`, `merge`, `deploy`) at both the command and execution boundaries.
- **Workspace Boundary**: The operational isolation boundary ensuring subprocesses run rooted in the configured project path.
- **Runtime Process Registry**: The in-memory tracking table mapping project aliases to live child process instances for execution timeout and cancellation management.
- **Allowlist**: The comma-separated list of authorized numeric Telegram User IDs configured in `.env`.
- **Batch Notification**: A single consolidated summary message delivered to Telegram upon command completion, avoiding live streaming noise and API rate limits.
- **Execution Timeout**: The maximum duration a child process is allowed to run before automatic termination (default: 10 minutes).

---

## 4. Features & Functional Requirements

### 4.1 Telegram Interface & Security Authentication

**Description**: Provides the Telegram bot interface using the `grammY` framework, enforcing strict identity allowlisting prior to processing any message. Realizes UJ-1, UJ-2, UJ-3.

#### FR-1: Telegram User ID Allowlisting
The system must inspect the sender's Telegram numeric User ID (`ctx.from.id`) on every incoming update against `ALLOWED_USER_IDS` configured in environment variables.
- **Consequences**:
  - If the sender ID matches the allowlist, the message proceeds to command handlers.
  - If the sender ID does not match, the system must drop the request silently without sending any response to the sender.
  - An unauthorized access event must be logged locally via Pino logger with the sender ID, username, and timestamp.
- **Out of Scope**: Multi-tiered role permissions (e.g. admin vs viewer); dynamic user invitations via Telegram.

#### FR-2: Explicit Project Command Dispatching
The system must parse incoming text commands using explicit project aliases (e.g., `/<command> <project> [args]`). Commands explicitly identify the target project; task state is maintained only for active local processes in the in-memory Runtime Process Registry and is not persistent application state.
- **Consequences**:
  - If an unrecognized project alias is supplied, the system must return an error listing valid aliases from `projects.yaml`.
  - If required arguments are missing, the system must reply with command syntax instructions.

---

### 4.2 Git Safety Invariant Engine

**Description**: Guarantees that neither remote prompts nor local AI agents can mutate upstream git history or create unauthorized commits. Realizes UJ-1, UJ-4.

#### FR-3: Strict Mutating Git Block at Execution Boundary
The system must strictly block and forbid execution of `git commit`, `git push`, `git merge`, `git rebase`, and deployment commands through a tiered defense model:
- **Consequences**:
  - **Primary Guard**: Overrides child process `PATH` to prepend a Git wrapper shim that immediately aborts mutating Git verbs with exit code 1.
  - **Secondary Guard**: Injects `core.hooksPath` pointing to pre-commit and pre-push hooks that unconditionally exit with code 1.
  - **Tertiary Guard**: Strips push credentials (`GITHUB_TOKEN`, `GIT_ASKPASS`, `SSH_AUTH_SOCK`) from child process environments.
  - Any attempt to execute forbidden git commands results in immediate process abort with exit code 1 and an alert logged to Pino.

#### FR-4: Explicit Human-Authorized Workspace Synchronization Operations
The system must provide a dedicated `/git <project> <subcommand>` command that permits only explicit, human-authorized synchronization operations: `pull` and `checkout <branch>`.
- **Consequences**:
  - `/git <project> pull` executes `git pull --ff-only` strictly within the resolved project workspace. If the local branch cannot be fast-forwarded due to divergence, the operation is strictly rejected with: `⚠️ Pull rejected: Divergence detected. Local branch cannot be fast-forwarded without a merge or rebase. Please resolve merges manually at your workstation.`
  - Prior to executing `checkout <branch>`, the system executes `git status --porcelain`. If uncommitted or staged changes exist in the working tree, the checkout is refused: `⚠️ Checkout refused: Working tree contains uncommitted changes. Stash or inspect with /diff before switching branches.`
  - If the working tree is clean, `/git <project> checkout <branch>` executes `git checkout <branch>` strictly within the resolved project workspace.
  - Any other git subcommand (e.g., `commit`, `push`, `reset --hard`, `clean -fd`) supplied to `/git` must be rejected immediately.

---

### 4.3 Polyglot Workspace Execution & Process Management

**Description**: Manages project directory resolution, subprocess execution via `execa`, timeout controls, and process cleanup. Realizes UJ-1, UJ-2, UJ-4.

#### FR-5: Project Resolution & Workspace Boundary
The system must resolve project aliases against `config/projects.yaml` using validated Zod schemas, enforcing application-level workspace boundaries (not claiming OS-level sandboxing).
- **Consequences**:
  - The execution `cwd` must be strictly bound to the canonical project `path` (`fs.realpathSync`).
  - The system must verify that the target directory exists on disk prior to spawning subprocesses.
  - Commands must never execute within MBridgeABot's own source repository directory.

#### FR-6: Subprocess Execution, Project Concurrency Locks & Secret Sanitization
The system must execute configured commands using `execa` without shell evaluation (`shell: false`), enforcing an execution timeout (default: 600 seconds), project concurrency serialization, and tiered secret protection.
- **Consequences**:
  - **Secret Isolation**: MBridge does not forward its own `.env` tokens or process secrets to child environments.
  - **Defense-in-Depth Sanitization**: Standard output and error streams must be sanitized to strip ANSI escape codes and redact sensitive values before sending to Telegram or writing to logs. Sensitive files (`.env*`, `*.pem`, `*.key`) are excluded from Telegram delivery.
  - **Concurrency Serialization**: Only one active execution task (build, test, agent, or git) may run per project alias at any given time. If a second command targets a busy project, it is rejected with: `⚠️ Project <alias> is currently busy running <task>. Wait for completion or use /cancel <alias>.`
  - If a command exceeds the execution timeout, the system terminates the process tree and notifies the user via Telegram.

#### FR-7: Graceful Process Cancellation
The system must provide a `/cancel <project>` command allowing the developer to terminate running child processes for that project.
- **Consequences**:
  - When `/cancel <project>` is received, the system queries the Runtime Process Registry for the active child process group.
  - The system issues `SIGTERM` to the process tree. If the process does not terminate within 5 seconds, the system sends `SIGKILL`.
  - The system replies to Telegram confirming termination: `🛑 Successfully terminated process for project: <project>`.
  - If no process is currently active for that project, the system replies: `ℹ️ No active processes running for <project>`.

---

### 4.4 Automated Build & Test Runner

**Description**: Executes developer-configured compilation and testing workflows, returning concise batch summaries. Realizes UJ-1, UJ-2.

#### FR-8: Project Build Command
The system must provide a `/build <project>` command that executes the configured `build` string from `projects.yaml`.
- **Consequences**:
  - The bot immediately sends an acknowledgment: `⏳ Running build for <project>...`.
  - Upon completion, the bot sends a batch notification containing: status (`✅ Success` or `❌ Failed`), elapsed duration, and exit code.
  - If the build fails, the message must include the last 10 lines of stderr/stdout.

#### FR-9: Project Test Command & Failure Reporting
The system must provide a `/test <project>` command that executes the configured `test` string from `projects.yaml`.
- **Consequences**:
  - The bot immediately sends an acknowledgment: `⏳ Running tests for <project>...`.
  - Upon completion, the bot sends a batch notification containing status (`✅ All tests passed` or `❌ Tests failed`) and elapsed duration.
  - If tests fail, the message must include the failure summary and stack trace excerpt from test runner output.
- **Out of Scope (v1)**: Forwarding image/screenshot files from test output directories.

---

### 4.5 Pluggable Agent Subsystem

**Description**: Dispatches local AI coding agents inside the project workspace via a standardized `AgentAdapter` interface. Realizes UJ-1, UJ-2.

#### FR-10: Standard AgentAdapter Interface Contract
The core system must communicate with AI agents via a uniform interface definition:
```typescript
export interface AgentAdapter {
  readonly providerId: string;
  execute(params: {
    projectPath: string;
    prompt: string;
    onLog?: (chunk: string) => void;
  }): Promise<{
    exitCode: number;
    durationMs: number;
    rawOutput: string;
  }>;
}
```
- **Consequences**:
  - Adding future providers (Claude CLI, Codex, Aider) requires only implementing this interface without altering bot command logic.

#### FR-11: Antigravity CLI Adapter (v1)
The system must provide an implementation of `AgentAdapter` for the Antigravity CLI (`agy`).
- **Consequences**:
  - The adapter spawns `agy` in non-interactive/prompt mode with `cwd` set to the resolved project directory.
  - The prompt received from the `/agent <project> <prompt>` command is sanitized and passed directly as CLI arguments.

#### FR-12: Post-Agent Git Diff & Impact Reporting
Upon completion of an agent run, the system must inspect the project working tree and report the exact impact to Telegram.
- **Consequences**:
  - Runs `git status --porcelain` in the project directory.
  - Formats the completion message with:
    - Status: `✅ Agent task completed` (or `❌ Agent failed with code N`)
    - Duration: e.g. `⏱️ 1m 45s`
    - Impact: e.g. `📁 3 files modified, 1 file created`
    - Quick hint: `Use /diff <project> to inspect full changes.`

---

### 4.6 Workspace Inspection & System Status

**Description**: Gives the developer immediate visibility into git status, code changes, and workstation vitals. Realizes UJ-1, UJ-2.

#### FR-13: Git Status & Diff Inspector
The system must provide a `/diff <project>` command that executes `git status --short` and `git diff` within the project directory.
- **Consequences**:
  - Formats output cleanly in markdown code blocks.
  - If the diff exceeds Telegram's message character limit (4096 characters), the system truncates the diff, appends a line count notice, and displays the top changed files.
  - If the working tree is clean, the system replies: `✨ Working tree is clean. No uncommitted changes.`

#### FR-14: System Status & Health
The system must provide a `/status` command reporting bot uptime, host workstation CPU/RAM usage, and mounted projects.
- **Consequences**:
  - Displays host OS, Node.js runtime version, bot uptime, free memory percentage, and a list of active project aliases.

#### FR-15: Projects Registry List
The system must provide a `/projects` command listing all configured project aliases, their filesystem paths, and their configured agent providers from `projects.yaml`.

#### FR-16: Telegram Update Idempotency
The system must maintain an in-memory bounded LRU cache of recently processed Telegram `update_id`s (capacity: 1,000 entries) to prevent duplicate execution upon network reconnections during the current process lifetime.
- **Consequences**:
  - Incoming updates matching an existing cached `update_id` are dropped silently without re-executing actions.
  - Read-only commands remain idempotent.
  - Mutating and expensive operations (`/build`, `/test`, `/agent`, `/git pull`) are strictly protected against duplicate execution.
  - The cache operates in-memory; persistent exactly-once guarantees across process restarts are explicitly out of scope for v1.

#### FR-17: Task Lifecycle State Machine & Correlation
The system must manage all active operations through an explicit, formal runtime state machine: `QUEUED` -> `RUNNING` -> (`COMPLETED` | `FAILED` | `CANCELLED` | `TIMED_OUT`). Startup orphan process cleanup operates under a dedicated system phase (`RECOVERY_MODE`).
- **Consequences**:
  - Every dispatched task is assigned a collision-resistant internal UUID (v4) and a 6-character short hex display ID (e.g. `a8f31c`) for Telegram notifications.
  - Terminal states are recorded in the task record before notifying Telegram.
  - Handlers and adapters must not invent ad-hoc lifecycle states.

---

## 5. Non-Goals (Explicit)

- **No Autonomous Git Commits or Pushes**: The bot and all underlying agents will never execute `git commit`, `git push`, `git rebase`, or create PRs.
- **No Deployments or Production Mutation**: The bot will never trigger deployment pipelines, server restarts, or cloud publishing scripts.
- **No Arbitrary Shell Execution**: The bot will not provide a `/bash` or `/exec` command. Only pre-configured commands in `projects.yaml` and prompt-driven `/agent` runs are permitted.
- **No Screenshot Ingestion / Telemetry in v1**: Test failure screenshot forwarding is deferred to future milestones. Terminal error summaries provide sufficient telemetry for v1.
- **No Multi-User Management / Web Dashboard**: MBridgeABot does not include a web UI, user registration, or database backend. State is stored in configuration files and memory.
- **No Separate External Cloud LLM API Keys**: Code assistance is delegated entirely to the local workstation agent CLI (Antigravity CLI); MBridgeABot does not make direct OpenAI/Anthropic API calls itself.

---

## 6. MVP Scope

### 6.1 In Scope (v1)
- `grammY`-based Telegram bot with strict numeric User ID allowlist middleware.
- `projects.yaml` configuration with Zod schema validation for project aliases, paths, build/test commands, and agent providers.
- Git Safety Invariant Guard strictly blocking mutating verbs (`commit`, `push`, `merge`, `deploy`).
- Dedicated `/git <project> pull` and `/git <project> checkout <branch>` commands.
- Polyglot Command Runner using `execa` with execution timeouts, ANSI stripping, and secret masking.
- Pluggable `AgentAdapter` interface with full Antigravity CLI (`agy`) v1 implementation.
- Post-agent git impact reporting (duration, files modified count, diff hint).
- Full command suite: `/status`, `/projects`, `/build`, `/test`, `/agent`, `/diff`, `/git`, `/cancel`.
- Pino structured logging for operational visibility and security auditing.

### 6.2 Out of Scope for MVP (Deferred)
- Test failure screenshot forwarding (Playwright report scraper).
- Claude CLI and Codex `AgentAdapter` implementations (architecture supports them; implementations deferred to v1.1).
- Interactive Telegram Inline Keyboard buttons for one-tap approvals.
- Active project session tracking (stateless explicit aliases are preferred for safety).
- Remote workstation / SSH tunneling support (v1 targets local workstation).

---

## 7. Success Metrics & Counter-Metrics

### Primary Metrics
- **SM-1 (Git Safety Invariant)**: **100%** block rate on any attempted `commit`, `push`, or `deploy` from `/agent` or bot commands (0 unauthorized git mutations permitted). Validates FR-3, FR-4.
- **SM-2 (Access Control)**: **0%** information disclosure or command execution for unauthorized Telegram user IDs (100% silent drop rate). Validates FR-1.
- **SM-3 (Execution Reliability)**: **> 98%** successful dispatch rate for configured `/build`, `/test`, and `/agent` commands without orphaned or unkillable background processes. Validates FR-5, FR-6, FR-7.
- **SM-4 (Dispatch Latency)**: **< 2.0s** from sending a command in Telegram to receiving the initial `⏳ Dispatching...` acknowledgment. Validates FR-2, FR-8, FR-9, FR-11.

### Counter-Metrics (Do Not Optimize)
- **SM-C1 (Do Not Optimize False Permissiveness)**: Under no circumstance should command parsing be made "smart" or fuzzy if it risks executing an unvalidated command or ambiguous project alias. Explicit failure is always preferred over speculative execution.
- **SM-C2 (Do Not Flood Chat)**: Output verbosity must not be increased to stream live terminal logs; batch completion notifications preserve Telegram rate limits and developer sanity.

---

## 8. Open Questions

- None identified for MVP. All core boundaries (stateless project aliases, Option A dedicated `/git` command, omission of screenshot telemetry, and Antigravity CLI v1 adapter) have been explicitly resolved and approved.

---

## 9. Assumptions Index

- `[ASSUMPTION-1]`: The host workstation has `git` and `node` (>= 20.0.0) installed and available in the system PATH.
- `[ASSUMPTION-2]`: The Antigravity CLI (`agy`) is pre-installed and authenticated on the workstation environment for projects using `agentProvider: "antigravity"`.
- `[ASSUMPTION-3]`: The Telegram Bot Token generated from `@BotFather` and the developer's numeric Telegram User ID are provided in a local `.env` file.
- `[ASSUMPTION-4]`: The host machine remains powered on and connected to the internet while the developer is away from their desk.
