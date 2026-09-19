import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  TaskState,
  isTerminalState,
  TERMINAL_STATES,
} from '../src/core/task/task.types.js';
import {
  TaskManager,
  InvalidStateTransitionError,
  resolveActiveTasksFilePath,
} from '../src/core/task/task-manager.js';
import {
  runStartupRecovery,
  isProcessAlive,
  killProcessTree,
} from '../src/core/task/recovery.js';

describe('Story 2.1: Task State Machine, Correlation & Startup Recovery', () => {
  let tempDir: string;
  let activeTasksFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbridge-task-test-'));
    activeTasksFile = path.join(tempDir, 'active-tasks.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Task State Definitions & Terminal Boundaries', () => {
    it('defines all required lifecycle states', () => {
      expect(TaskState.QUEUED).toBe('QUEUED');
      expect(TaskState.RUNNING).toBe('RUNNING');
      expect(TaskState.COMPLETED).toBe('COMPLETED');
      expect(TaskState.FAILED).toBe('FAILED');
      expect(TaskState.CANCELLED).toBe('CANCELLED');
      expect(TaskState.TIMED_OUT).toBe('TIMED_OUT');
    });

    it('identifies terminal states correctly', () => {
      expect(isTerminalState(TaskState.QUEUED)).toBe(false);
      expect(isTerminalState(TaskState.RUNNING)).toBe(false);
      expect(isTerminalState(TaskState.COMPLETED)).toBe(true);
      expect(isTerminalState(TaskState.FAILED)).toBe(true);
      expect(isTerminalState(TaskState.CANCELLED)).toBe(true);
      expect(isTerminalState(TaskState.TIMED_OUT)).toBe(true);
      expect(TERMINAL_STATES.size).toBe(4);
    });
  });

  describe('Correlation ID Generation & Lookups', () => {
    it('assigns an internal UUID v4 and a 6-character hex display ID upon creation', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({
        projectAlias: 'ECOMMERCE',
        command: 'npm run build',
      });

      // UUID v4 format validation
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(task.taskId).toMatch(uuidV4Regex);

      // 6-character hex display ID validation
      const hex6Regex = /^[0-9a-f]{6}$/;
      expect(task.displayId).toMatch(hex6Regex);

      // Initial properties
      expect(task.projectAlias).toBe('ecommerce');
      expect(task.command).toBe('npm run build');
      expect(task.state).toBe(TaskState.QUEUED);
      expect(task.createdAt).toBeDefined();
    });

    it('retrieves tasks by full UUID and case-insensitively by 6-char displayId', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({
        projectAlias: 'billing-api',
        command: 'cargo test',
      });

      // Lookup by UUID
      const byUuid = manager.getTask(task.taskId);
      expect(byUuid?.taskId).toBe(task.taskId);

      // Lookup by displayId (lowercase)
      const byDisplayId = manager.getTask(task.displayId);
      expect(byDisplayId?.taskId).toBe(task.taskId);

      // Lookup by displayId (uppercase)
      const byDisplayIdUpper = manager.getTask(task.displayId.toUpperCase());
      expect(byDisplayIdUpper?.taskId).toBe(task.taskId);

      // Lookup with whitespace
      const byDisplayIdWhitespace = manager.getTask(`  ${task.displayId}  `);
      expect(byDisplayIdWhitespace?.taskId).toBe(task.taskId);

      // Unknown lookup returns undefined
      expect(manager.getTask('non-existent-id')).toBeUndefined();
      expect(manager.getTask('')).toBeUndefined();
      expect(manager.getTask(null)).toBeUndefined();
    });

    it('validates non-empty projectAlias and command on createTask', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      expect(() => manager.createTask({ projectAlias: '', command: 'build' })).toThrow(
        'projectAlias must not be empty'
      );
      expect(() => manager.createTask({ projectAlias: '   ', command: 'build' })).toThrow(
        'projectAlias must not be empty'
      );
      expect(() => manager.createTask({ projectAlias: 'app', command: '' })).toThrow(
        'command must not be empty'
      );
      expect(() => manager.createTask({ projectAlias: 'app', command: '   ' })).toThrow(
        'command must not be empty'
      );
      expect(() => manager.createTask(undefined as any)).toThrow(
        'Task parameters must be provided'
      );
    });

    it('validates positive integer rootPid in startTask', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'build' });
      expect(() => manager.startTask(task.taskId, -1)).toThrow('Invalid rootPid');
      expect(() => manager.startTask(task.taskId, 0)).toThrow('Invalid rootPid');
      expect(() => manager.startTask(task.taskId, 1.5)).toThrow('Invalid rootPid');
      expect(() => manager.startTask(task.taskId, NaN)).toThrow('Invalid rootPid');
    });

    it('resolves active tasks file path with custom path or fallback candidates', () => {
      const custom = resolveActiveTasksFilePath('custom/path.json');
      expect(custom).toContain('custom');
      const standard = resolveActiveTasksFilePath();
      expect(standard).toContain('active-tasks.json');
    });
  });

  describe('Lifecycle State Transitions', () => {
    it('transitions strictly through: QUEUED -> RUNNING -> COMPLETED', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'make' });

      expect(task.state).toBe(TaskState.QUEUED);

      const running = manager.startTask(task.taskId, 1234);
      expect(running.state).toBe(TaskState.RUNNING);
      expect(running.rootPid).toBe(1234);
      expect(running.startedAt).toBeDefined();

      const completed = manager.completeTask(task.taskId, 0);
      expect(completed.state).toBe(TaskState.COMPLETED);
      expect(completed.exitCode).toBe(0);
      expect(completed.completedAt).toBeDefined();
    });

    it('transitions strictly through: QUEUED -> RUNNING -> FAILED', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'make' });

      manager.startTask(task.taskId, 4567);
      const failed = manager.failTask(task.taskId, 'Process exited with code 1', 1);

      expect(failed.state).toBe(TaskState.FAILED);
      expect(failed.failureReason).toBe('Process exited with code 1');
      expect(failed.exitCode).toBe(1);
    });

    it('transitions strictly through: QUEUED -> RUNNING -> CANCELLED', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'make' });

      manager.startTask(task.taskId, 9999);
      const cancelled = manager.cancelTask(task.taskId, 'User clicked /cancel');

      expect(cancelled.state).toBe(TaskState.CANCELLED);
      expect(cancelled.failureReason).toBe('User clicked /cancel');
    });

    it('transitions directly from QUEUED to CANCELLED', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'make' });

      const cancelled = manager.cancelTask(task.taskId, 'Cancelled before execution');
      expect(cancelled.state).toBe(TaskState.CANCELLED);
    });

    it('transitions strictly through: QUEUED -> RUNNING -> TIMED_OUT', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'make' });

      manager.startTask(task.taskId, 8888);
      const timedOut = manager.timeoutTask(task.taskId, 'Execution exceeded 300s limit');

      expect(timedOut.state).toBe(TaskState.TIMED_OUT);
      expect(timedOut.failureReason).toBe('Execution exceeded 300s limit');
    });

    it('strictly forbids and rejects invalid or skipped state transitions', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'app', command: 'make' });

      // Cannot complete directly from QUEUED
      expect(() => manager.completeTask(task.taskId)).toThrow(InvalidStateTransitionError);

      // Cannot timeout directly from QUEUED
      expect(() => manager.timeoutTask(task.taskId)).toThrow(InvalidStateTransitionError);

      // Start task to RUNNING
      manager.startTask(task.taskId, 100);

      // Cannot start an already RUNNING task
      expect(() => manager.startTask(task.taskId, 101)).toThrow(InvalidStateTransitionError);

      // Complete to terminal
      manager.completeTask(task.taskId, 0);

      // Terminal state cannot transition to any other state
      expect(() => manager.startTask(task.taskId, 102)).toThrow(InvalidStateTransitionError);
      expect(() => manager.completeTask(task.taskId)).toThrow(InvalidStateTransitionError);
      expect(() => manager.failTask(task.taskId)).toThrow(InvalidStateTransitionError);
      expect(() => manager.cancelTask(task.taskId)).toThrow(InvalidStateTransitionError);
      expect(() => manager.timeoutTask(task.taskId)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('Active Tasks File Persistence (.mbridge/active-tasks.json)', () => {
    it('persists task entry when transitioning to RUNNING and removes on terminal', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({ projectAlias: 'ecommerce', command: 'npm run test' });

      // Initially QUEUED -> not yet in active-tasks.json
      expect(manager.readActiveTasksFile()).toHaveLength(0);

      // Transition to RUNNING
      manager.startTask(task.taskId, 2468);

      // File should exist and contain active task entry
      expect(fs.existsSync(activeTasksFile)).toBe(true);
      const activeEntries = manager.readActiveTasksFile();
      expect(activeEntries).toHaveLength(1);
      expect(activeEntries[0].taskId).toBe(task.taskId);
      expect(activeEntries[0].displayId).toBe(task.displayId);
      expect(activeEntries[0].projectAlias).toBe('ecommerce');
      expect(activeEntries[0].rootPid).toBe(2468);
      expect(activeEntries[0].command).toBe('npm run test');
      expect(activeEntries[0].startedAt).toBeDefined();

      // Complete task
      manager.completeTask(task.taskId);

      // Active tasks file should now be empty
      const afterCompletion = manager.readActiveTasksFile();
      expect(afterCompletion).toHaveLength(0);
    });

    it('handles multiple active tasks concurrently', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task1 = manager.createTask({ projectAlias: 'proj1', command: 'build1' });
      const task2 = manager.createTask({ projectAlias: 'proj2', command: 'build2' });

      manager.startTask(task1.taskId, 1001);
      manager.startTask(task2.taskId, 1002);

      let active = manager.readActiveTasksFile();
      expect(active).toHaveLength(2);

      manager.failTask(task1.taskId, 'Build failed', 1);
      active = manager.readActiveTasksFile();
      expect(active).toHaveLength(1);
      expect(active[0].taskId).toBe(task2.taskId);

      manager.completeTask(task2.taskId, 0);
      active = manager.readActiveTasksFile();
      expect(active).toHaveLength(0);
    });
  });

  describe('Startup Crash Recovery Logic (src/core/task/recovery.ts)', () => {
    it('returns empty result cleanly if active tasks file does not exist', async () => {
      const nonExistent = path.join(tempDir, 'does-not-exist.json');
      const result = await runStartupRecovery({ activeTasksFilePath: nonExistent });

      expect(result.recoveredTasks).toHaveLength(0);
      expect(result.terminatedPids).toHaveLength(0);
    });

    it('returns empty result if active tasks file contains empty array', async () => {
      fs.writeFileSync(activeTasksFile, '[]', 'utf-8');
      const result = await runStartupRecovery({ activeTasksFilePath: activeTasksFile });

      expect(result.recoveredTasks).toHaveLength(0);
      expect(result.terminatedPids).toHaveLength(0);
    });

    it('recovers corrupted active tasks file safely without crashing', async () => {
      fs.writeFileSync(activeTasksFile, '{ not a valid json [', 'utf-8');
      const result = await runStartupRecovery({ activeTasksFilePath: activeTasksFile });

      expect(result.recoveredTasks).toHaveLength(0);
      expect(fs.readFileSync(activeTasksFile, 'utf-8')).toBe('[]');
    });

    it('detects orphaned active tasks, terminates alive process trees, marks tasks FAILED (SERVER_RESTARTED), and clears active tasks file', async () => {
      const orphanedEntries = [
        {
          taskId: 'e4b29c11-8c43-4a8f-b982-123456789abc',
          displayId: '1a2b3c',
          projectAlias: 'ecommerce',
          rootPid: 54321,
          command: 'npm run build',
          startedAt: '2026-09-17T06:00:00.000Z',
        },
        {
          taskId: 'f5c30d22-9d54-4b90-c093-987654321def',
          displayId: '4d5e6f',
          projectAlias: 'billing-api',
          rootPid: 54322,
          command: 'cargo build',
          startedAt: '2026-09-17T06:05:00.000Z',
        },
      ];

      fs.writeFileSync(activeTasksFile, JSON.stringify(orphanedEntries), 'utf-8');

      const mockCheckAlive = vi.fn().mockImplementation((pid: number) => {
        // PID 54321 is still running, PID 54322 was already terminated
        return pid === 54321;
      });

      const mockKillTree = vi.fn().mockResolvedValue(true);

      const result = await runStartupRecovery({
        activeTasksFilePath: activeTasksFile,
        checkPidAlive: mockCheckAlive,
        killPidTree: mockKillTree,
        getSystemBootTime: () => new Date('2026-09-17T00:00:00.000Z').getTime(),
      });

      // Verification:
      // 1. Alive PID was terminated
      expect(mockCheckAlive).toHaveBeenCalledWith(54321);
      expect(mockCheckAlive).toHaveBeenCalledWith(54322);
      expect(mockKillTree).toHaveBeenCalledTimes(1);
      expect(mockKillTree).toHaveBeenCalledWith(54321);
      expect(result.terminatedPids).toEqual([54321]);

      // 2. Both tasks marked as FAILED with SERVER_RESTARTED
      expect(result.recoveredTasks).toHaveLength(2);
      expect(result.recoveredTasks[0].displayId).toBe('1a2b3c');
      expect(result.recoveredTasks[0].state).toBe(TaskState.FAILED);
      expect(result.recoveredTasks[0].failureReason).toBe('SERVER_RESTARTED');
      expect(result.recoveredTasks[0].terminated).toBe(true);

      expect(result.recoveredTasks[1].displayId).toBe('4d5e6f');
      expect(result.recoveredTasks[1].state).toBe(TaskState.FAILED);
      expect(result.recoveredTasks[1].failureReason).toBe('SERVER_RESTARTED');
      expect(result.recoveredTasks[1].terminated).toBe(false);

      // 3. Active tasks file was cleared
      const fileContents = fs.readFileSync(activeTasksFile, 'utf-8');
      expect(fileContents).toBe('[]');
    });

    it('skips process termination if task was started prior to current system boot (PID recycling guard)', async () => {
      const mockKill = vi.fn().mockResolvedValue(true);
      const mockAlive = vi.fn().mockReturnValue(true);
      const systemBootTime = 1700000000000;
      const taskStartTime = new Date(systemBootTime - 60000).toISOString();

      fs.writeFileSync(
        activeTasksFile,
        JSON.stringify([
          {
            taskId: 'recycled-pid-task',
            displayId: 'rec123',
            projectAlias: 'ecommerce',
            rootPid: 9876,
            command: 'npm run build',
            startedAt: taskStartTime,
          },
        ]),
        'utf-8'
      );

      const result = await runStartupRecovery({
        activeTasksFilePath: activeTasksFile,
        checkPidAlive: mockAlive,
        killPidTree: mockKill,
        getSystemBootTime: () => systemBootTime,
      });

      // Recycled PID must NOT be checked or killed
      expect(mockAlive).not.toHaveBeenCalled();
      expect(mockKill).not.toHaveBeenCalled();
      expect(result.terminatedPids).toHaveLength(0);
      expect(result.recoveredTasks).toHaveLength(1);
      expect(result.recoveredTasks[0].terminated).toBe(false);
      expect(result.recoveredTasks[0].state).toBe(TaskState.FAILED);
      expect(result.recoveredTasks[0].failureReason).toBe('SERVER_RESTARTED');
    });
  });

  describe('OS Process Inspection Helpers', () => {
    it('accurately identifies current running process PID as alive', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('identifies invalid, negative or dead PIDs as not alive', () => {
      expect(isProcessAlive(-1)).toBe(false);
      expect(isProcessAlive(0)).toBe(false);
      expect(isProcessAlive(NaN)).toBe(false);
      // High improbable PID
      expect(isProcessAlive(9999999)).toBe(false);
    });

    it('killProcessTree returns false if process does not exist', async () => {
      const result = await killProcessTree(9999999);
      expect(result).toBe(false);
    });
  });

  describe('I/O & Edge-Case Matrix Scenarios', () => {
    // Scenario 1: New Task Instantiation
    it('Matrix Scenario 1: New Task Instantiation -> State QUEUED, UUID and 6-char hex assigned', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({
        projectAlias: 'ecommerce',
        command: '/build ecommerce',
      });

      expect(task.state).toBe(TaskState.QUEUED);
      expect(task.taskId.length).toBe(36);
      expect(task.displayId.length).toBe(6);
      expect(task.startedAt).toBeUndefined();
    });

    // Scenario 2: Task Enters Execution
    it('Matrix Scenario 2: Task Enters Execution -> State RUNNING, entry in active-tasks.json', () => {
      const manager = new TaskManager({ activeTasksFilePath: activeTasksFile });
      const task = manager.createTask({
        projectAlias: 'ecommerce',
        command: '/build ecommerce',
      });

      const running = manager.startTask(task.taskId, 7777);
      expect(running.state).toBe(TaskState.RUNNING);
      expect(running.rootPid).toBe(7777);
      expect(running.startedAt).toBeDefined();

      const active = manager.readActiveTasksFile();
      expect(active).toHaveLength(1);
      expect(active[0].taskId).toBe(task.taskId);
      expect(active[0].rootPid).toBe(7777);
    });

    // Scenario 3: Bot Crash & Restart Recovery
    it('Matrix Scenario 3: Bot Crash & Restart Recovery -> Verified orphan PIDs terminated, tasks marked FAILED (SERVER_RESTARTED)', async () => {
      const mockKill = vi.fn().mockResolvedValue(true);
      const mockAlive = vi.fn().mockReturnValue(true);

      fs.writeFileSync(
        activeTasksFile,
        JSON.stringify([
          {
            taskId: 'test-uuid',
            displayId: 'abc123',
            projectAlias: 'ecommerce',
            rootPid: 4321,
            command: 'npm run build',
            startedAt: '2026-09-17T08:00:00.000Z',
          },
        ]),
        'utf-8'
      );

      const result = await runStartupRecovery({
        activeTasksFilePath: activeTasksFile,
        checkPidAlive: mockAlive,
        killPidTree: mockKill,
        getSystemBootTime: () => new Date('2026-09-17T00:00:00.000Z').getTime(),
      });

      expect(mockKill).toHaveBeenCalledWith(4321);
      expect(result.terminatedPids).toContain(4321);
      expect(result.recoveredTasks[0].state).toBe(TaskState.FAILED);
      expect(result.recoveredTasks[0].failureReason).toBe('SERVER_RESTARTED');

      // Clear active tasks file
      const finalContent = fs.readFileSync(activeTasksFile, 'utf-8');
      expect(finalContent).toBe('[]');
    });
  });
});
