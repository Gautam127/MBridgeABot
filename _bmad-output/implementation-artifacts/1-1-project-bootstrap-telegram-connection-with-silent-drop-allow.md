---
title: 'Story 1.1: Project Bootstrap & Telegram Connection with Silent-Drop Allowlist'
type: 'feature'
created: '2026-09-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '0a0e9ae3277f9c375fbcb04378f5ff43ce26435c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Modern developers need a secure remote workstation bridge without exposing their system to unauthorized public Telegram access or unintended mutations.
**Approach:** Initialize a modern Node.js 20+ ES Module TypeScript project with grammY and Pino logging, enforcing a silent-drop allowlist middleware for all non-allowlisted Telegram user IDs.

## Boundaries & Constraints

**Always:**
- Silently drop updates from user IDs not listed in `ALLOWED_USER_IDS` without replying to Telegram.
- Log a structured `WARN` security audit event in Pino with unauthorized user ID, timestamp, and message text.
- Allow authorized user IDs to pass through to downstream handlers.

**Never:**
- Send any discovery response, error message, or acknowledgment to unauthorized senders.
- Expose process environment secrets in logs or responses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authorized User Ping | `ctx.from.id` in `ALLOWED_USER_IDS`, text: `/ping` | Status / greeting response sent to Telegram | N/A |
| Unauthorized Access Attempt | `ctx.from.id` not in `ALLOWED_USER_IDS` | Message silently dropped; no Telegram reply | Log `WARN` audit event in Pino |
| Missing `.env` or Malformed `ALLOWED_USER_IDS` | Missing environment variable on startup | Application refuses to boot | Exit process with descriptive config error |

</frozen-after-approval>

## Code Map

- `backend/package.json` -- Project dependencies (`grammy`, `pino`, `dotenv`, `zod`, `typescript`, `@types/node`)
- `backend/tsconfig.json` -- TypeScript compiler options (ES2022, NodeNext modules, strict mode)
- `backend/src/config/env.ts` -- Environment validation for `TELEGRAM_BOT_TOKEN` and `ALLOWED_USER_IDS`
- `backend/src/bot/bot.ts` -- grammY bot instantiation and middleware setup
- `backend/src/bot/middleware/allowlist.ts` -- Silent drop authentication middleware
- `backend/src/index.ts` -- Application bootstrap entrypoint

## Tasks & Acceptance

**Execution:**
- [x] `backend/package.json` & `backend/tsconfig.json` -- Initialize Node.js 20+ ESM TypeScript project in `backend/`
- [x] `backend/src/config/env.ts` -- Zod schema validation for `.env` variables
- [x] `backend/src/logger/index.ts` -- Pino structured logger setup
- [x] `backend/src/bot/middleware/allowlist.ts` -- Implement silent-drop check against `ALLOWED_USER_IDS`
- [x] `backend/src/bot/bot.ts` -- Setup grammY bot with allowlist middleware and basic `/ping` handler
- [x] `backend/src/index.ts` -- Wire bot startup lifecycle
- [x] `backend/tests/allowlist.test.ts` -- Unit tests for authorized pass-through and unauthorized silent drop

**Acceptance Criteria:**
- Given an empty `backend/` directory, when initialized, then `backend/package.json` and `backend/tsconfig.json` configure a modern Node.js 20+ ES module project with strict TypeScript checking, `grammY` for Telegram bot connectivity, `pino` for structured logging, and `dotenv` for configuration loading.
- Given `ALLOWED_USER_IDS="12345678,87654321"` configured in `backend/.env`, when a Telegram update arrives from an unauthorized user ID (e.g. `ctx.from.id = 99999999`), then the allowlist middleware silently drops the update without sending any reply or acknowledgment to Telegram, and logs a structured `WARN` security audit event in Pino containing the unauthorized user ID, timestamp, and attempted message text.
- Given a Telegram update from an authorized user ID (`ctx.from.id = 12345678`), when the update reaches the allowlist middleware, then the request is permitted to proceed to downstream command handlers, and the bot responds with a basic greeting/status acknowledgment when `/ping` is sent.

## Implementation Notes

- Scaffolded modern ESM TypeScript project inside `backend/` with `package.json`, `tsconfig.json`, and `.env.example`.
- Implemented Zod schema validation in `backend/src/config/env.ts` ensuring `TELEGRAM_BOT_TOKEN` is present and `ALLOWED_USER_IDS` is parsed into a `Set<number>`.
- Configured structured Pino logger in `backend/src/logger/index.ts` with dev pretty-printing.
- Implemented `createAllowlistMiddleware` in `backend/src/bot/middleware/allowlist.ts` enforcing silent drops on unauthorized numeric Telegram user IDs and logging security audit warnings.
- Wired grammY bot instance in `backend/src/bot/bot.ts` with error handling, allowlist middleware, and `/ping` and `/start` commands.
- Configured application entrypoint in `backend/src/index.ts` with lifecycle logging and `SIGINT`/`SIGTERM` handlers.
- Created unit tests in `backend/tests/env.test.ts` and `backend/tests/allowlist.test.ts` covering authorized access, silent drops, and malformed environment inputs. All 11 tests pass.

## Spec Change Log

## Review Triage Log

- `backend/tests/env.test.ts` -- 5 tests passed covering valid config, missing token, empty user IDs, non-integer IDs, negative IDs.
- `backend/tests/allowlist.test.ts` -- 6 tests passed covering authorized pass-through, unauthorized silent drop, missing user metadata, and grammY bot update routing.
- Matrix Test Audit: 100% matrix rows verified and tested.

## Design Notes
