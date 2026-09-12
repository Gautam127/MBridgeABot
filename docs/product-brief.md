> **MBridgeABot** 🚀  
> *Human-in-the-Loop Remote AI Dev Assistant & Workstation Bridge*

MBridgeABot connects developers to their local development workstation via Telegram (with remote/cloud workstation support as a future roadmap item). It provides a secure, least-privilege control plane to trigger builds, run tests, inspect diffs, and dispatch local AI coding tasks from mobile or desktop chat.

---

## 🎯 Value Proposition & Operating Philosophy

- **Human-in-the-Loop Git Delivery**:
  - **Forbidden at all times**: `git commit`, `git push`, PR creation, merging, rebasing, or deploying.
  - **Explicit user prompt only**: `git fetch`, `git pull`, and branch switching (`checkout`/`switch`) are never executed automatically. They run only if the user explicitly instructs it in the Telegram prompt.
- **Pluggable Agent Interface**: The core system communicates with AI agents via a generic `AgentAdapter` interface. V1 uses Antigravity CLI (`agy`), but the architecture supports Claude CLI, Aider, or Codex adapters without modifying bot logic.
- **Polyglot & Project-Configurable**: Each project defines its workspace and development commands through configuration.
- **Visual Failure Telemetry**: Automatically detects and forwards test failure screenshots (e.g. Playwright reports) to Telegram.
- **Least-Privilege Security Model**: Telegram user allowlisting, directory jailing, sanitized argument parsing, and environment secret containment.

---

## 🏗️ Architecture Design

```text
               ┌───────────────────────┐
               │     Telegram App      │
               └───────────┬───────────┘
                           │ (grammY)
                           ▼
               ┌───────────────────────┐
               │    MBridgeABot (Node) │
               │  - User Allowlist     │
               │  - Project Registry   │
               │  - Git Invariant Guard│
               │  - Command Runner     │
               └───────────┬───────────┘
                           │
                 ┌─────────▼─────────┐
                 │  Agent Interface  │
                 └─────────┬─────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   Antigravity        Claude CLI         Codex/Aider
     Adapter           Adapter             Adapter
     (V1 - agy)       (Future)            (Future)
```

---

## ⚙️ Configuration Specification (`projects.yaml`)

```yaml
projects:
  ecommerce:
    path: "D:/Projects/ecommerce"
    build: "npm run build"
    test: "npx playwright test"
    testScreenshotsDir: "playwright-report"
    agentProvider: "antigravity" # Adapter to use for /agent
  billing-api:
    path: "D:/Projects/billing-api"
    build: "cargo build"
    test: "cargo test"
    agentProvider: "antigravity"
```

---

## ⚡ Supported Commands

| Command | Syntax | Description |
| :--- | :--- | :--- |
| `/status` | `/status` | Bot uptime, system health, and list of mounted project workspaces. |
| `/projects` | `/projects` | Lists all configured project aliases, root paths, and agent adapters. |
| `/build` | `/build <project>` | Executes the project's configured build command. |
| `/test` | `/test <project>` | Executes the project's configured test command and sends failure screenshots if found. |
| `/agent` | `/agent <project> <prompt>` | Dispatches the configured `AgentAdapter` (e.g. `agy`) inside the project folder. |
| `/diff` | `/diff <project>` | Runs `git status` and a concise `git diff` for developer inspection. |
| `/cancel` | `/cancel <project>` | Gracefully terminates any running child process for that project. |

---

## 🔒 Security & Git Safety Invariants

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

### Strict Git Isolation
- **Allowed under explicit prompt only**: `fetch`, `pull`, `checkout`, `switch`.
- **Always Blocked for Agents**: `commit`, `push`, PR creation, merge, deploy.
- **Directory Jailing**: Commands and agents run strictly with `cwd` bound to the resolved project directory.
- **Single Source of Truth for Secrets**: Only `TELEGRAM_BOT_TOKEN` and `ALLOWED_USER_IDS` in `.env`.

---

## 📂 Codebase Structure (TypeScript)

```text
MBridgeABot/
├── backend/
│   ├── config/
│   │   └── projects.yaml           # Project registry & command definitions
│   ├── src/
│   │   ├── config/                 # Zod validation for env and projects.yaml
│   │   ├── bot/
│   │   │   ├── bot.ts              # grammY bot setup
│   │   │   ├── middleware/         # Allowlist auth & logging
│   │   │   └── handlers/           # /status, /projects, /build, /test, /agent, /diff, /cancel
│   │   ├── core/
│   │   │   ├── executor.ts         # Subprocess runner (execa, timeout, cancel, ANSI strip)
│   │   │   ├── git/
│   │   │   │   ├── git-guard.ts    # Invariant validator (blocks commit/push; checks consent)
│   │   │   │   └── git-service.ts  # Read-only diff and status inspector
│   │   │   └── agent/
│   │   │       ├── agent.interface.ts     # Standard AgentAdapter contract
│   │   │       ├── agent-factory.ts       # Adapter resolver
│   │   │       └── adapters/
│   │   │           └── antigravity.adapter.ts  # Implementation for agy CLI
│   │   ├── logger/                 # Pino logger
│   │   └── index.ts                # Application entrypoint
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── docs/                           # Documentation & specifications
├── _bmad/                          # BMAD module & workflows
├── _bmad-output/                   # Planning & tracking artifacts
└── README.md
```
