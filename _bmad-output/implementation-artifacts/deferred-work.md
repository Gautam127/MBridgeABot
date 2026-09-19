# Deferred Work

## Deferred from: code review of 2-4-project-build-test-commands-with-bounded-telegram-reporting.md (2026-09-19)

- **Unix process tree kill requires detached spawn** (`backend/src/core/process/command-runner.ts:66`): When spawning subprocesses on Unix/Linux, `killProcessTree` relies on negative PID group kill, which requires `detached: true`. Deferred to Story 2.3 (`2-3-subprocess-runner-platform-native-process-tree-manager`).
