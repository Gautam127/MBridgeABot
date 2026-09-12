# MBridgeABot 🚀
*Human-in-the-Loop Remote AI Dev Assistant & Workstation Bridge*

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![grammY](https://img.shields.io/badge/Telegram-grammY-24A1DE?logo=telegram&logoColor=white)](https://grammy.dev)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**MBridgeABot** bridges software developers to their local development workstation via Telegram. It provides a secure, least-privilege control plane to trigger builds, run test suites, inspect diffs, and dispatch local autonomous AI coding agents (starting with Google Antigravity CLI) directly from mobile or desktop chat without granting automated push authority to AI agents.

---

## 🎯 Operating Philosophy & Core Invariants

MBridgeABot is built around a single uncompromised principle: **Human-in-the-Loop Delivery**.

- **Zero Automatic Git Mutations**:
  - **Strictly Forbidden for AI Agents**: `git commit`, `git push`, PR generation, merging, rebasing, and deploying.
  - **Explicit Consent Only**: `git fetch`, `git pull`, and branch switching (`checkout`/`switch`) run strictly when explicitly commanded by the developer.
  - **Developer Owns the Repository**: AI agents propose code edits and run local tests; staging and committing remain entirely human-driven.
- **Silent-Drop Security Model**:
  - Non-allowlisted Telegram user IDs are silently dropped without any acknowledgement, response, or metadata disclosure.
  - Unauthorized access attempts trigger structured `WARN` security audit logs containing the sender ID and timestamp.
- **Telegram Update Idempotency**:
  - Bounded in-memory LRU cache (1,000 entries) tracks incoming Telegram `update_id`s to prevent duplicate execution of workstation tasks during network retries or polling blips.

---

## 🏗️ Architecture

```text
               ┌───────────────────────┐
               │     Telegram App      │
               └───────────┬───────────┘
                           │ (grammY)
                           ▼
               ┌───────────────────────┐
               │    MBridgeABot Core   │
               │  - User Allowlist     │
               │  - Update Deduplicator│
               │  - Project Registry   │
               │  - Git Guard Invariant│
               │  - Process Runner     │
               └───────────┬───────────┘
                           │
                 ┌─────────▼─────────┐
                 │  Agent Interface  │
                 └─────────┬─────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   Antigravity        Claude CLI         Aider/Codex
     Adapter           Adapter             Adapter
     (V1 - agy)       (Future)            (Future)
```

---

## ⚡ Supported Commands

| Command | Syntax | Description |
| :--- | :--- | :--- |
| `/ping` | `/ping` | Health check verifying bot connectivity and daemon responsiveness. |
| `/status` | `/status` | Displays workstation uptime, system vitals, and mounted project aliases. |
| `/projects`| `/projects` | Lists registered project workspaces, paths, and active AI adapters. |
| `/build` | `/build <project>` | Triggers the configured build command for the given project workspace. |
| `/test` | `/test <project>` | Executes the project's test suite and automatically sends failure screenshots if found. |
| `/diff` | `/diff <project>` | Summarizes working tree `git status` and a concise unified diff. |
| `/agent` | `/agent <project> <prompt>` | Dispatches the configured `AgentAdapter` (e.g. `agy`) inside the project folder. |
| `/cancel` | `/cancel <project>` | Gracefully terminates any running child process or agent task for that project. |

---

## 🔒 Security & Git Delivery Invariants

```text
                    ┌──────────────────────────────────────────────┐
                    │               Incoming Request               │
                    └──────────────────────┬───────────────────────┘
                                           │
                       Is Telegram User ID in Allowlist?
                                           │
                                ┌──────────┴──────────┐
                                │ No                  │ Yes
                                ▼                     ▼
                           [DROP & AUDIT]    Is Git operation requested?
                                                      │
                                           ┌──────────┴──────────┐
                                           │ Mutating / Remote   │ Read / User-Prompted
                                           ▼                     ▼
                                    [BLOCK STRICTLY]         [EXECUTE]
                            (commit, push, merge, deploy)   (status, diff, or prompt-driven fetch/switch)
```

1. **User Allowlisting**: Only user IDs explicitly enumerated in `ALLOWED_USER_IDS` pass beyond the gateway.
2. **Directory Jailing**: Process execution is strictly pinned (`cwd`) to the resolved project directory.
3. **Secret Isolation**: Child processes and agent wrappers are stripped of GitHub tokens, SSH keys, and push credentials.

---

## 📂 Repository Layout

```text
MBridgeABot/
├── backend/
│   ├── config/
│   │   └── projects.yaml           # Project registry & command definitions
│   ├── src/
│   │   ├── config/                 # Zod validation for env and project schemas
│   │   ├── bot/
│   │   │   ├── bot.ts              # grammY bot setup & middleware pipeline
│   │   │   └── middleware/
│   │   │       ├── allowlist.ts    # FR-1 Silent Drop Allowlist Middleware
│   │   │       └── idempotency.ts  # FR-2 Telegram Update Idempotency Filter (LRU)
│   │   ├── core/                   # Subprocess runner, Git guards, Agent adapters
│   │   ├── logger/                 # Structured Pino logger
│   │   └── index.ts                # Application entrypoint & graceful shutdown
│   ├── tests/                      # Vitest test suite
│   ├── package.json
│   └── tsconfig.json
├── docs/                           # Architecture specifications and product briefs
├── _bmad-output/                   # BMAD planning and implementation artifacts
├── AGENTS.md                       # Strict agent operating guidelines (No Git Mutations)
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+** (LTS recommended)
- **Telegram Account** and a bot created via [@BotFather](https://t.me/botfather)
- Your numeric Telegram User ID (retrievable via [@userinfobot](https://t.me/userinfobot))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Gautam127/MBridgeABot.git
   cd MBridgeABot/backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your bot credentials:
   ```env
   NODE_ENV=development
   LOG_LEVEL=info
   TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
   ALLOWED_USER_IDS="12345678,87654321"
   ```

### Running the Bot

- **Development Mode** (with hot reload via `tsx watch`):
  ```bash
  npm run dev
  ```

- **Production Build & Start**:
  ```bash
  npm run build
  npm start
  ```

### Running Tests

Execute the Vitest test suite covering environment validation, security allowlists, and update idempotency:

```bash
npm test
```

---

## 🗺️ Roadmap & Implementation Status

- [x] **Story 1.1: Project Bootstrap & Silent-Drop Allowlist** (ESM TypeScript, grammY, Pino, Zod, allowlist filter)
- [x] **Story 1.2: Telegram Update Idempotency Filter** (Bounded 1,000-entry LRU cache, deduplication)
- [ ] **Story 1.3: Workstation Telemetry & System Status Command** (`/status` command, system vitals)
- [ ] **Story 1.4: Projects Configuration Loader & Registry** (`projects.yaml`, `/projects` command)
- [ ] **Epic 2: Task Execution & Process Management** (`/build`, `/test`, failure screenshots, `/cancel`)
- [ ] **Epic 3: Workspace Navigation & Safe Inspection** (`/diff`, controlled checkout/pull)
- [ ] **Epic 4: Autonomous Agent Dispatch & Safety Guards** (`/agent` with Antigravity CLI, 3-tier Git guard)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
