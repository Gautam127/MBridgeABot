import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectRegistry } from '../src/core/project-registry.js';
import { TaskManager } from '../src/core/task/task-manager.js';
import { ProjectLockManager } from '../src/core/lock/project-lock-manager.js';
import { RuntimeProcessRegistry } from '../src/core/task/process-registry.js';
import { ProcessTreeManager } from '../src/core/process/process-tree-manager.js';
import { createCancelHandler } from '../src/bot/handlers/cancel.js';
import { createBuildHandler } from '../src/bot/handlers/build.js';
import { TaskState } from '../src/core/task/task.types.js';

describe('Story 2.5: Process Cancellation Command (/cancel)', () => {
  let registry: ProjectRegistry;
  let taskManager: TaskManager;
  let lockManager: ProjectLockManager;
  let processRegistry: RuntimeProcessRegistry;
  let mockProcessTreeManager: ProcessTreeManager;
  let mockKill: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry = new ProjectRegistry();
    registry.register({
      alias: 'webapp',
      path: '/workspace/webapp',
      buildCmd: 'npm run build',
      testCmd: 'npm test',
      agentProvider: 'antigravity',
      timeoutSeconds: 300,
    });
    registry.register({
      alias: 'api-service',
      path: '/workspace/api-service',
      buildCmd: 'go build ./...',
      testCmd: 'go test ./...',
      agentProvider: 'antigravity',
    });

    taskManager = new TaskManager();
    lockManager = new ProjectLockManager();
    processRegistry = new RuntimeProcessRegistry();

    mockKill = vi.fn().mockResolvedValue(true);
    mockProcessTreeManager = new ProcessTreeManager({
      isAliveFn: () => true,
      execFn: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    });
    vi.spyOn(mockProcessTreeManager, 'kill').mockImplementation(mockKill);
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

  describe('Validation & Idle Project Handling', () => {
    it('replies with usage instructions when project alias is omitted', async () => {
      const handler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      const { ctx, replies } = createMockContext('/cancel');
      await handler(ctx);

      expect(replies[0].message).toContain('Usage: /cancel <project-alias>');
      expect(mockKill).not.toHaveBeenCalled();
    });

    it('Matrix Scenario 3: Unknown Project Alias -> replies with error and lists /projects', async () => {
      const handler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      const { ctx, replies } = createMockContext('/cancel unknown');
      await handler(ctx);

      expect(replies[0].message).toContain('Project "unknown" not found');
      expect(replies[0].message).toContain('/projects');
      expect(mockKill).not.toHaveBeenCalled();
    });

    it('Matrix Scenario 2: No Active Task -> replies with idle notification', async () => {
      const handler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      const { ctx, replies } = createMockContext('/cancel webapp');
      await handler(ctx);

      expect(replies[0].message).toBe('ℹ️ No active task running on project "webapp".');
      expect(mockKill).not.toHaveBeenCalled();
    });
  });

  describe('Active Task Cancellation Lifecycle', () => {
    it('Matrix Scenario 1: Active Task Cancelled -> terminates process tree, releases lock, and replies with confirmation', async () => {
      // Setup active running task
      const task = taskManager.createTask({
        projectAlias: 'webapp',
        command: 'npm run build',
      });
      taskManager.startTask(task.taskId, 4567);
      lockManager.acquire('webapp', task.taskId, task.displayId);
      processRegistry.register({
        projectAlias: 'webapp',
        taskId: task.taskId,
        displayId: task.displayId,
        rootPid: 4567,
      });

      expect(lockManager.isLocked('webapp')).toBe(true);
      expect(processRegistry.hasProcess('webapp')).toBe(true);

      const handler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      const { ctx, replies } = createMockContext('/cancel webapp');
      await handler(ctx);

      // Verify ProcessTreeManager.kill was called with PID
      expect(mockKill).toHaveBeenCalledWith(4567);

      // Verify task state transitioned to CANCELLED
      const updatedTask = taskManager.getTask(task.taskId);
      expect(updatedTask?.state).toBe(TaskState.CANCELLED);
      expect(updatedTask?.failureReason).toContain('Cancelled by user via /cancel');

      // Verify project lock released
      expect(lockManager.isLocked('webapp')).toBe(false);

      // Verify process registry cleared
      expect(processRegistry.hasProcess('webapp')).toBe(false);

      // Verify reply format
      expect(replies[0].message).toBe(`🛑 Task [${task.displayId}] on "webapp" has been cancelled.`);
    });

    it('case-insensitively normalizes project alias when cancelling', async () => {
      const task = taskManager.createTask({
        projectAlias: 'webapp',
        command: 'npm run build',
      });
      taskManager.startTask(task.taskId, 8888);
      lockManager.acquire('webapp', task.taskId, task.displayId);
      processRegistry.register({
        projectAlias: 'webapp',
        taskId: task.taskId,
        displayId: task.displayId,
        rootPid: 8888,
      });

      const handler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      const { ctx, replies } = createMockContext('/cancel WebApp');
      await handler(ctx);

      expect(mockKill).toHaveBeenCalledWith(8888);
      expect(lockManager.isLocked('webapp')).toBe(false);
      expect(replies[0].message).toContain(`🛑 Task [${task.displayId}] on "webapp" has been cancelled.`);
    });

    it('guarantees lock release and registry cleanup even if ProcessTreeManager throws', async () => {
      mockKill.mockRejectedValueOnce(new Error('Process termination failed: Access denied'));

      const task = taskManager.createTask({
        projectAlias: 'webapp',
        command: 'npm run build',
      });
      taskManager.startTask(task.taskId, 9999);
      lockManager.acquire('webapp', task.taskId, task.displayId);
      processRegistry.register({
        projectAlias: 'webapp',
        taskId: task.taskId,
        displayId: task.displayId,
        rootPid: 9999,
      });

      const handler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      const { ctx, replies } = createMockContext('/cancel webapp');
      await handler(ctx);

      expect(replies[0].message).toContain('❌ Error cancelling task on "webapp"');
      expect(replies[0].message).toContain('Access denied');

      // Crucial invariant: lock must be released even on error
      expect(lockManager.isLocked('webapp')).toBe(false);
      expect(processRegistry.hasProcess('webapp')).toBe(false);
    });
  });

  describe('Integration between /build and /cancel', () => {
    it('cancelling a running /build task prevents conflicting error replies and allows subsequent /build', async () => {
      let triggerCommandExit: ((exitCode: number) => void) | null = null;

      const mockRunner = vi.fn().mockImplementation(async (options) => {
        if (options.onSpawn) {
          options.onSpawn(3322);
        }
        return new Promise((resolve) => {
          triggerCommandExit = (exitCode: number) => {
            resolve({
              exitCode,
              output: 'Process aborted by signal',
              stdout: '',
              stderr: 'Process aborted by signal',
              durationSeconds: 1.0,
              timedOut: false,
            });
          };
        });
      });

      const buildHandler = createBuildHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        runner: mockRunner,
      });

      const cancelHandler = createCancelHandler({
        projectRegistry: registry,
        taskManager,
        lockManager,
        processRegistry,
        processTreeManager: mockProcessTreeManager,
      });

      // 1. Trigger /build
      const { ctx: buildCtx, replies: buildReplies } = createMockContext('/build webapp');
      const buildPromise = buildHandler(buildCtx);

      // Allow microtask to process initial ack reply and trigger runner.onSpawn
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Initial acknowledgment received
      expect(buildReplies.length).toBe(1);
      expect(buildReplies[0].message).toContain('⏳ Running build on webapp');
      expect(lockManager.isLocked('webapp')).toBe(true);

      // 2. While build is running, issue /cancel webapp
      const { ctx: cancelCtx, replies: cancelReplies } = createMockContext('/cancel webapp');
      await cancelHandler(cancelCtx);

      expect(cancelReplies[0].message).toContain('has been cancelled');
      expect(mockKill).toHaveBeenCalledWith(3322);
      expect(lockManager.isLocked('webapp')).toBe(false);

      // 3. Subprocess exits as a result of the kill signal
      if (triggerCommandExit) {
        (triggerCommandExit as any)(143);
      }
      await buildPromise;

      // /build should NOT have sent a failure reply because it was already cancelled
      expect(buildReplies.length).toBe(1);

      // 4. Subsequent /build can now acquire the lock immediately
      const { ctx: buildCtx2, replies: buildReplies2 } = createMockContext('/build webapp');
      mockRunner.mockImplementationOnce(async (options) => {
        if (options.onSpawn) {
          options.onSpawn(5544);
        }
        return {
          exitCode: 0,
          output: 'Build succeeded',
          stdout: 'Build succeeded',
          stderr: '',
          durationSeconds: 0.5,
          timedOut: false,
        };
      });

      await buildHandler(buildCtx2);
      expect(buildReplies2[0].message).toContain('⏳ Running build on webapp');
      expect(buildReplies2[1].message).toContain('✅ Build succeeded on "webapp"');
    });
  });

  describe('ProcessTreeManager Engine', () => {
    it('returns true immediately if PID is not alive', async () => {
      const manager = new ProcessTreeManager({
        isAliveFn: () => false,
      });
      const result = await manager.kill(12345);
      expect(result).toBe(true);
    });

    it('uses taskkill on win32 platform', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const manager = new ProcessTreeManager({
        execFn: mockExec,
        isAliveFn: (pid) => pid === 12345,
      });

      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const result = await manager.kill(12345);
        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith('taskkill /pid 12345 /T /F');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('falls back to process kill if taskkill throws but process is dead', async () => {
      let alive = true;
      const mockExec = vi.fn().mockImplementation(async () => {
        alive = false;
        throw new Error('taskkill error: process already gone');
      });
      const manager = new ProcessTreeManager({
        execFn: mockExec,
        isAliveFn: () => alive,
      });

      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const result = await manager.kill(7777);
        expect(result).toBe(true);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });
});
