import type { Context } from 'grammy';
import { type ProjectRegistry, defaultProjectRegistry } from '../../core/project-registry.js';
import { type TaskManager, defaultTaskManager } from '../../core/task/task-manager.js';
import { type ProjectLockManager, defaultProjectLockManager, ProjectLockedError } from '../../core/lock/project-lock-manager.js';
import { type RuntimeProcessRegistry, defaultProcessRegistry } from '../../core/task/process-registry.js';
import { runCommand as defaultRunCommand, type RunCommandOptions, type CommandRunResult } from '../../core/process/command-runner.js';
import { formatTaskAcknowledgment, formatExecutionResult } from '../../core/formatters/telegram-formatter.js';
import { TaskState } from '../../core/task/task.types.js';
import type { ExecutionHandlerDependencies } from './build.js';

export function createTestHandler(deps?: ExecutionHandlerDependencies) {
  const registry = deps?.projectRegistry ?? defaultProjectRegistry;
  const taskManager = deps?.taskManager ?? defaultTaskManager;
  const lockManager = deps?.lockManager ?? defaultProjectLockManager;
  const processRegistry = deps?.processRegistry ?? defaultProcessRegistry;
  const runner = deps?.runner ?? defaultRunCommand;

  return async (ctx: Context): Promise<void> => {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const aliasArg = parts[1];

    if (!aliasArg) {
      await ctx.reply('⚠️ Usage: /test <project-alias>\n\nUse /projects to view registered aliases.');
      return;
    }

    const project = registry.getProject(aliasArg);
    if (!project) {
      await ctx.reply(
        `❌ Project "${aliasArg}" not found.\n\nUse /projects to list registered projects.`
      );
      return;
    }

    // Step 1: Check existing lock to avoid creating dangling task records
    const existingLock = lockManager.getLock(project.alias);
    if (existingLock) {
      await ctx.reply(
        `⚠️ Project "${project.alias}" is busy running task [${existingLock.displayId}]. Use /cancel ${project.alias} to abort it first.`
      );
      return;
    }

    let taskRecord;
    try {
      taskRecord = taskManager.createTask({
        projectAlias: project.alias,
        command: project.testCmd,
      });

      lockManager.acquire(project.alias, taskRecord.taskId, taskRecord.displayId);
    } catch (err) {
      if (err instanceof ProjectLockedError) {
        await ctx.reply(err.message);
        return;
      }
      await ctx.reply(`❌ Error initializing test task: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Step 2: Immediate acknowledgment within < 2s
    await ctx.reply(formatTaskAcknowledgment('test', project.alias, taskRecord.displayId));

    // Step 3: Subprocess execution with guaranteed lock release
    try {
      const result = await runner({
        command: project.testCmd,
        cwd: project.path,
        timeoutSeconds: project.timeoutSeconds ?? 600,
        onSpawn: (pid) => {
          taskManager.startTask(taskRecord.taskId, pid);
          processRegistry.register({
            projectAlias: project.alias,
            taskId: taskRecord.taskId,
            displayId: taskRecord.displayId,
            rootPid: pid,
          });
        },
      });

      // Check if task was cancelled while running
      const currentTask = taskManager.getTask(taskRecord.taskId);
      if (currentTask?.state === TaskState.CANCELLED) {
        return;
      }

      if (result.timedOut) {
        taskManager.timeoutTask(taskRecord.taskId, `Test timed out after ${project.timeoutSeconds ?? 600}s`);
      } else if (result.exitCode === 0) {
        taskManager.completeTask(taskRecord.taskId, 0);
      } else {
        taskManager.failTask(taskRecord.taskId, `Process exited with code ${result.exitCode}`, result.exitCode);
      }

      const replyMessage = formatExecutionResult({
        action: 'test',
        projectAlias: project.alias,
        exitCode: result.exitCode,
        durationSeconds: result.durationSeconds,
        output: result.output,
      });

      await ctx.reply(replyMessage, { parse_mode: 'Markdown' }).catch(async () => {
        await ctx.reply(replyMessage);
      });
    } catch (err: any) {
      const currentTask = taskManager.getTask(taskRecord.taskId);
      if (currentTask?.state !== TaskState.CANCELLED) {
        taskManager.failTask(taskRecord.taskId, err?.message || String(err));
        await ctx.reply(`❌ Test execution error on "${project.alias}": ${err?.message || String(err)}`);
      }
    } finally {
      processRegistry.unregister(project.alias, taskRecord.taskId);
      lockManager.release(project.alias, taskRecord.taskId);
    }
  };
}
