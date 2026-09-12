---
title: 'Story 1.4: Projects Configuration Loader & Registry Command'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
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
- [ ] `src/config/projects.schema.ts` -- Create Zod schema for project entries
- [ ] `src/core/project-registry.ts` -- Implement loader reading `projects.yaml` with lowercase normalization
- [ ] `src/bot/handlers/projects.ts` -- Implement `/projects` command listing registered aliases
- [ ] `src/bot/bot.ts` -- Wire `/projects` handler into bot
- [ ] `tests/project-registry.test.ts` -- Test valid loading, invalid schema rejection, and case-insensitive lookup

**Acceptance Criteria:**
- Given a `projects.yaml` configuration file at bot root, when the bot starts up, then the configuration is validated against a Zod schema requiring `alias` (string), `path` (string), `buildCmd` (string), `testCmd` (string), and `agentProvider` (string), and all project aliases are normalized to lowercase (`alias.toLowerCase()`) so they can be queried case-insensitively.
- Given one or more valid projects configured in `projects.yaml`, when an authorized user sends `/projects`, then MBridge replies with a formatted list of all registered projects showing alias, path, and agent provider, and appends a next-action hint (e.g., `Next: /build <alias> or /test <alias>`).
- Given `projects.yaml` is missing or fails Zod validation on boot, when MBridge initializes, then the bot logs a descriptive fatal error pointing out the exact Zod validation failures and refuses to start with invalid configuration.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes
