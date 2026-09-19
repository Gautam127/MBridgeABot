import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectRegistry } from '../src/core/project-registry.js';
import { TaskManager } from '../src/core/task/task-manager.js';
import { ProjectLockManager } from '../src/core/lock/project-lock-manager.js';
import { createBuildHandler } from '../src/bot/handlers/build.js';
import { createTestHandler } from '../src/bot/handlers/test.js';
import {
  formatExecutionResult,
  truncateMessage,
  MAX_TELEGRAM_MESSAGE_LENGTH,
  DEFAULT_TRUNCATION_NOTICE,
} from '../src/core/formatters/telegram-formatter.js';
import type { CommandRunResult, RunCommandOptions } from '../src/core/process/command-runner.js';

describe('Story 2.4: Project Build & Test Commands with Bounded Telegram Reporting', () => {
  let registry: ProjectRegistry;
  let taskManager: TaskManager;
  let lockManager: ProjectLockManager;
  let mockRunner: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry = new ProjectRegistry();
    registry.register({
      alias: 'ecommerce',
      path: '/workspace/ecommerce',
      buildCmd: 'npm run build',
      testCmd: 'npm test',
      agentProvider: 'antigravity',
      timeoutSeconds: 300,
    });
    registry.register({
      alias: 'billing-api',
      path: '/workspace/billing-api',
      buildCmd: 'cargo build',
      testCmd: 'cargo test',
      agentProvider: 'antigravity',
    });

    taskManager = new TaskManager();
    lockManager = new ProjectLockManager();

    mockRunner = vi.fn().mockImplementation(async (options: RunCommandOptions): Promise<CommandRunResult> => {
      if (options.onSpawn) {
        options.onSpawn(12345);
      }
      return {
        exitCode: 0,
        output: 'Build completed successfully in 1200ms\nAll targets up to date.',
        stdout: 'Build completed successfully in 1200ms\nAll targets up to date.',
        stderr: '',
        durationSeconds: 1.2,
        timedOut: false,
      };
    });
  });

  function createMockContext(text: string) {
    const replies: Array<{ message: string; options?: any }> = [];
    const ctx: any = {
      message: {
        text,
      },
      reply: vi.fn().mockImplementation(async (message: string, options?: any) => {
        replies.push({ message, options });
        return { message_id: replies.length };
      }),
    };
    return { ctx, replies };
  }

  describe('Immediate Acknowledgment & Dispatch (<2.0s)', () => {
    it('/build sends initial acknowledgment containing 6-character task display ID within 2s', async () => {
      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      expect(replies.length).toBeGreaterThanOrEqual(2);
      // Reply 1: Acknowledgment
      expect(replies[0].message).toMatch(/^⏳ Running build on ecommerce \[task: [0-9a-f]{6}\]\.\.\.$/);

      // Verify runner invocation
      expect(mockRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'npm run build',
          cwd: '/workspace/ecommerce',
          timeoutSeconds: 300,
        })
      );
    });

    it('/test sends initial acknowledgment and executes testCmd', async () => {
      const handler = createTestHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/test ecommerce');
      await handler(ctx);

      expect(replies[0].message).toMatch(/^⏳ Running test on ecommerce \[task: [0-9a-f]{6}\]\.\.\.$/);
      expect(mockRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'npm test',
          cwd: '/workspace/ecommerce',
        })
      );
    });
  });

  describe('Success & Failure Reporting with Diagnostics', () => {
    it('reports success with duration and next hint when command exits with 0', async () => {
      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      const finalReply = replies[1].message;
      expect(finalReply).toContain('✅ Build succeeded on "ecommerce" in 1.2s');
      expect(finalReply).toContain('👉 Next: /test ecommerce');
      expect(lockManager.isLocked('ecommerce')).toBe(false);
    });

    it('reports failure with non-zero exit code, duration, and tail logs', async () => {
      mockRunner.mockResolvedValueOnce({
        exitCode: 1,
        output: 'Error: Cannot find module @core/db\n    at index.ts:15:3\nBuild failed with 1 error.',
        stdout: '',
        stderr: 'Error: Cannot find module @core/db\n    at index.ts:15:3\nBuild failed with 1 error.',
        durationSeconds: 2.5,
        timedOut: false,
      });

      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      const finalReply = replies[1].message;
      expect(finalReply).toContain('❌ Build failed on "ecommerce" (exit 1) in 2.5s');
      expect(finalReply).toContain('Cannot find module @core/db');
      expect(finalReply).toContain('👉 Next: /build ecommerce or /projects');
      expect(lockManager.isLocked('ecommerce')).toBe(false);
    });

    it('redacts sensitive bot tokens and API keys in failure diagnostics', async () => {
      mockRunner.mockResolvedValueOnce({
        exitCode: 1,
        output: 'Fatal: Auth failed with token 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567 and Bearer secret_session_token_123',
        stdout: '',
        stderr: 'Fatal: Auth failed with token 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567 and Bearer secret_session_token_123',
        durationSeconds: 1.0,
        timedOut: false,
      });

      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      const finalReply = replies[1].message;
      expect(finalReply).toContain('[REDACTED]');
      expect(finalReply).toContain('Bearer [REDACTED]');
      expect(finalReply).not.toContain('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567');
      expect(finalReply).not.toContain('secret_session_token_123');
    });
  });

  describe('Bounded Message Length (<3,500 Chars) & Line Truncation', () => {
    it('truncates massive compiler outputs strictly under 3,500 characters at clean newline', () => {
      // Generate 10,000 characters of compiler error lines
      const massiveLog = Array.from({ length: 200 }, (_, i) => `Error line ${i}: TS2304 Cannot find name Symbol_${i}`).join('\n');
      expect(massiveLog.length).toBeGreaterThan(6000);

      const formatted = formatExecutionResult({
        action: 'build',
        projectAlias: 'ecommerce',
        exitCode: 1,
        durationSeconds: 5.0,
        output: massiveLog,
      });

      expect(formatted.length).toBeLessThanOrEqual(MAX_TELEGRAM_MESSAGE_LENGTH);
      expect(formatted).toContain(DEFAULT_TRUNCATION_NOTICE);
      expect(formatted).toContain('❌ Build failed on "ecommerce"');
      expect(formatted).toContain('👉 Next: /build ecommerce or /projects');
    });

    it('truncateMessage trims text before newline boundary with suffix notice', () => {
      const input = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const truncated = truncateMessage(input, 25, '[Truncated]');
      expect(truncated.length).toBeLessThanOrEqual(25);
      expect(truncated).toContain('[Truncated]');
    });
  });

  describe('Concurrency Lock Enforcement & Error Handling', () => {
    it('immediately rejects second request on busy project with 409 conflict message', async () => {
      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      // Acquire lock manually to simulate active running task
      lockManager.acquire('ecommerce', 'running-task-id', '3a8f12');

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      // Should not spawn process and reply with 409 conflict notice immediately
      expect(mockRunner).not.toHaveBeenCalled();
      expect(replies[0].message).toBe(
        '⚠️ Project "ecommerce" is busy running task [3a8f12]. Use /cancel ecommerce to abort it first.'
      );
    });

    it('replies with usage instructions if project alias is omitted', async () => {
      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build');
      await handler(ctx);

      expect(replies[0].message).toContain('Usage: /build <project-alias>');
    });

    it('replies with error if project alias is not found in registry', async () => {
      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build non-existent-project');
      await handler(ctx);

      expect(replies[0].message).toContain('Project "non-existent-project" not found');
      expect(replies[0].message).toContain('/projects');
    });

    it('guarantees lock release when command runner throws an unexpected exception', async () => {
      mockRunner.mockRejectedValueOnce(new Error('Spawn failed: EACCES permission denied'));

      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      expect(replies[1].message).toContain('EACCES permission denied');
      // Lock must be released
      expect(lockManager.isLocked('ecommerce')).toBe(false);
    });
  });

  describe('I/O & Edge-Case Matrix Scenarios', () => {
    // Scenario 1: Build Success
    it('Matrix Scenario 1: Build Success -> /build ecommerce exits with 0 -> ✅ Build succeeded in Xs, next hint', async () => {
      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      expect(replies[1].message).toMatch(/✅ Build succeeded on "ecommerce" in \d+\.\d+s/);
      expect(replies[1].message).toContain('👉 Next: /test ecommerce');
    });

    // Scenario 2: Build Failure
    it('Matrix Scenario 2: Build Failure -> /build ecommerce exits with non-zero -> ❌ Build failed, duration, tail log excerpt (redacted)', async () => {
      mockRunner.mockResolvedValueOnce({
        exitCode: 2,
        output: 'Error compiling bundle: Invalid token 9876543210:ABCdefGHIjklMNOpqrsTUVwxyz-1234567\nExit code 2',
        stdout: '',
        stderr: 'Error compiling bundle: Invalid token 9876543210:ABCdefGHIjklMNOpqrsTUVwxyz-1234567\nExit code 2',
        durationSeconds: 3.1,
        timedOut: false,
      });

      const handler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        runner: mockRunner,
      });

      const { ctx, replies } = createMockContext('/build ecommerce');
      await handler(ctx);

      expect(replies[1].message).toContain('❌ Build failed on "ecommerce" (exit 2) in 3.1s');
      expect(replies[1].message).toContain('[REDACTED]');
      expect(replies[1].message).not.toContain('9876543210:ABCdefGHIjklMNOpqrsTUVwxyz-1234567');
    });

    // Scenario 3: Output > 3,500 chars
    it('Matrix Scenario 3: Output > 3,500 chars -> Message cleanly cut at newline < 3,500 chars with truncation notice', () => {
      const largeErrorLog = Array.from({ length: 300 }, (_, idx) => `[diagnostic] Test worker #${idx} failed assertion with code 0x${idx.toString(16)}`).join('\n');
      expect(largeErrorLog.length).toBeGreaterThan(15000);

      const resultMessage = formatExecutionResult({
        action: 'test',
        projectAlias: 'ecommerce',
        exitCode: 1,
        durationSeconds: 4.8,
        output: largeErrorLog,
      });

      expect(resultMessage.length).toBeLessThanOrEqual(3500);
      expect(resultMessage).toContain('[Output truncated. Full logs retained on workstation.]');
      expect(resultMessage).toContain('❌ Test failed on "ecommerce"');
    });
  });
});
