---
title: 'Story 1.4: Projects Configuration Loader & Registry Command'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '52b879258a977acdc1151b806b8e6f45281cd763'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The bot must understand what workstation projects it is permitted to operate on, validate their configurations strictly via Zod, and allow mobile inspection via `/projects`.
**Approach:** Implement `projects.yaml` parser and Zod validator at startup with case-insensitive normalization, and create the `/projects` command handler.

## Boundaries & Constraints

**Always:**
- Validate `projects.yaml` using Zod (`alias`, `path`, `buildCmd`, `testCmd`, `agentProvider`).
- Normalize all project aliases to lowercase (`alias.toLowerCase()`).
- Refuse to start if `projects.yaml` is missing or fails validation.
- Return formatted list of mounted projects with next-action hint on `/projects`.

**Never:**
- Allow undefined or unvalidated project configurations into runtime state.
- Expose secret tokens in project definition outputs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid Config on Boot | Valid `config/projects.yaml` | Projects parsed, normalized, registered in registry | N/A |
| Invalid Config on Boot | Missing mandatory field in `projects.yaml` | App crashes on startup with descriptive Zod error | Log fatal error and exit process |
| User Sends `/projects` | Authorized user sends `/projects` | Lists all mounted project aliases, paths, and providers | Next hint: `Next: /build <alias>` |

</frozen-after-approval>

## Code Map

- `config/projects.yaml` -- Configuration file for mounted workstation projects
- `src/config/projects.schema.ts` -- Zod schema definition and type exports
- `src/core/project-registry.ts` -- Registry loader, alias normalization, and query methods
- `src/bot/handlers/projects.ts` -- `/projects` command handler
- `tests/project-registry.test.ts` -- Unit tests for schema validation and alias normalization

## Tasks & Acceptance

**Execution:**
- [x] `src/config/projects.schema.ts` -- Create Zod schema for project entries
- [x] `src/core/project-registry.ts` -- Implement loader reading `projects.yaml` with lowercase normalization
- [x] `src/bot/handlers/projects.ts` -- Implement `/projects` command listing registered aliases
- [x] `src/bot/bot.ts` -- Wire `/projects` handler into bot
- [x] `tests/project-registry.test.ts` -- Test valid loading, invalid schema rejection, and case-insensitive lookup

**Acceptance Criteria:**
- Given a `projects.yaml` configuration file at bot root, when the bot starts up, then the configuration is validated against a Zod schema requiring `alias` (string), `path` (string), `buildCmd` (string), `testCmd` (string), and `agentProvider` (string), and all project aliases are normalized to lowercase (`alias.toLowerCase()`) so they can be queried case-insensitively.
- Given one or more valid projects configured in `projects.yaml`, when an authorized user sends `/projects`, then MBridge replies with a formatted list of all registered projects showing alias, path, and agent provider, and appends a next-action hint (e.g., `Next: /build <alias> or /test <alias>`).
- Given `projects.yaml` is missing or fails Zod validation on boot, when MBridge initializes, then the bot logs a descriptive fatal error pointing out the exact Zod validation failures and refuses to start with invalid configuration.

### Review Findings

- [x] [Review][Patch] Escape Telegram Markdown special characters for aliases and paths in formatProjectsMessage [`backend/src/bot/handlers/projects.ts:23`]
- [x] [Review][Patch] Trim whitespace and enforce non-empty normalized alias schema [`backend/src/config/projects.schema.ts:476`]
- [x] [Review][Patch] Trim query aliases in `getProject` and `hasProject` in ProjectRegistry [`backend/src/core/project-registry.ts:634`]
- [x] [Review][Patch] Implement atomic state replacement in `loadFromFile` and `loadFromYaml` [`backend/src/core/project-registry.ts:664`]
- [x] [Review][Patch] Add test coverage for underscore alias Markdown escaping and whitespace trimming [`backend/tests/project-registry.test.ts:1120`]

#### Rejected
- `backend/src/bot/handlers/projects.ts` -- Local try/catch around `ctx.reply`: rejected (low severity; central `bot.catch` already logs and handles command errors).

## Implementation Notes

- Created `src/config/projects.schema.ts`:
  - Defined `projectEntrySchema` requiring `alias`, `path`, `buildCmd`, `testCmd`, and `agentProvider` with automatic `.toLowerCase()` alias normalization and optional `timeoutSeconds` / `testScreenshotsDir`.
  - Defined `projectsConfigSchema` supporting both list and dictionary/map project formats in YAML.
  - Implemented `parseProjectsYaml` using `yaml` parser and strict Zod validation with formatted issue paths.
- Created `src/core/project-registry.ts`:
  - Implemented `ProjectRegistry` class with case-insensitive normalization, lookup, registration, duplicate detection, and file loading.
  - Provided `resolveProjectsConfigPath` searching candidate paths (`config/projects.yaml`, `projects.yaml`, environment overrides).
- Implemented `/projects` command handler in `src/bot/handlers/projects.ts`:
  - Formats mounted projects list showing alias, path, and provider without leaking tokens or build/test commands.
  - Appends actionable next-step hint: `👉 _Next:_ /build <alias> or /test <alias>`.
- Wired `/projects` into bot in `src/bot/bot.ts` behind existing silent-drop allowlist middleware.
- Configured startup boot loader in `src/index.ts` to validate `projects.yaml` on initialization and fail fatally if missing or invalid.
- Added default `config/projects.yaml` and `backend/config/projects.yaml`.
- Created comprehensive unit test suite in `tests/project-registry.test.ts` (28 tests across schema, registry, handler, bot, and matrix scenarios).

## Spec Change Log

_None._

## Review Triage Log

- `src/config/projects.schema.ts`: Strict Zod validation and safe YAML parsing verified.
- `src/core/project-registry.ts`: Case-insensitive lookups, duplicate detection, and robust config resolution verified.
- `src/bot/handlers/projects.ts`: Markdown formatting with safe token exclusion and next-action hint verified.
- `src/bot/bot.ts`: Command registered and protected by allowlist middleware verified.
- `tests/project-registry.test.ts`: 28 tests passing; 100% of I/O & Edge-Case Matrix rows verified and passing.
- Matrix Test Audit: 100% matrix scenarios verified and tested.

## Design Notes

- Case normalization occurs at the Zod transform boundary and is preserved throughout `ProjectRegistry` lookups, ensuring case-insensitive access (`ecommerce`, `Ecommerce`, `ECOMMERCE`).
- Preprocessing allows seamless support for both dictionary-style project definitions and list-style definitions.
