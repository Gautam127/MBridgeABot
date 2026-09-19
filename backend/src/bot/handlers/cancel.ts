import type { Context } from 'grammy';
import { type ProjectRegistry, defaultProjectRegistry } from '../../core/project-registry.js';
import { type TaskManager, defaultTaskManager } from '../../core/task/task-manager.js';
import { type ProjectLockManager, defaultProjectLockManager } from '../../core/lock/project-lock-manager.js';
import { type RuntimeProcessRegistry, defaultProcessRegistry } from '../../core/task/process-registry.js';
import { type ProcessTreeManager, defaultProcessTreeManager } from '../../core/process/process-tree-manager.js';
import { TaskState } from '../../core/task/task.types.js';

export interface CancelHandlerDependencies {
  projectRegistry?: ProjectRegistry;
  taskManager?: TaskManager;
  lockManager?: ProjectLockManager;
  processRegistry?: RuntimeProcessRegistry;
  processTreeManager?: ProcessTreeManager;
}

export function createCancelHandler(deps?: CancelHandlerDependencies) {
  const registry = deps?.projectRegistry ?? defaultProjectRegistry;
  const taskManager = deps?.taskManager ?? defaultTaskManager;
  const lockManager = deps?.lockManager ?? defaultProjectLockManager;
  const processRegistry = deps?.processRegistry ?? defaultProcessRegistry;
  const processTreeManager = deps?.processTreeManager ?? defaultProcessTreeManager;

  return async (ctx: Context): Promise<void> => {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const aliasArg = parts[1];

    if (!aliasArg) {
      await ctx.reply('⚠️ Usage: /cancel <project-alias>\n\nUse /projects to view registered aliases.');
      return;
    }

    const project = registry.getProject(aliasArg);
    if (!project) {
      await ctx.reply(
        `❌ Project "${aliasArg}" not found.\n\nUse /projects to list registered projects.`
      );
      return;
    }

    // Step 1: Locate active process / task for target project
    const activeProcess = processRegistry.getProcess(project.alias);
    const activeTask = taskManager
      .getActiveTasks()
      .find((t) => t.projectAlias.toLowerCase() === project.alias.toLowerCase());
    const currentLock = lockManager.getLock(project.alias);

    // If no active process or running task or lock is associated with the project
    if (!activeProcess && !activeTask && !currentLock) {
      await ctx.reply(`ℹ️ No active task running on project "${project.alias}".`);
      return;
    }

    const targetPid = activeProcess?.rootPid ?? activeTask?.rootPid;
    const targetTaskId = activeProcess?.taskId ?? activeTask?.taskId ?? currentLock?.taskId;
    const displayId =
      activeProcess?.displayId ?? activeTask?.displayId ?? currentLock?.displayId ?? targetTaskId ?? 'unknown';

    try {
      // Step 2: Terminate child process tree
      if (targetPid) {
        await processTreeManager.kill(targetPid);
      }

      // Step 3: Transition task state to CANCELLED
      if (targetTaskId) {
        const task = taskManager.getTask(targetTaskId);
        if (task && task.state === TaskState.RUNNING) {
          taskManager.cancelTask(targetTaskId, 'Cancelled by user via /cancel');
        }
      }

      await ctx.reply(`🛑 Task [${displayId}] on "${project.alias}" has been cancelled.`);
    } catch (err: any) {
      await ctx.reply(
        `❌ Error cancelling task on "${project.alias}": ${err?.message || String(err)}`
      );
    } finally {
      // Step 4: Always guarantee project lock and process registry cleanup
      if (targetTaskId) {
        lockManager.release(project.alias, targetTaskId);
        processRegistry.unregister(project.alias, targetTaskId);
      } else {
        lockManager.release(project.alias);
        processRegistry.unregister(project.alias);
      }
    }
  };
}
