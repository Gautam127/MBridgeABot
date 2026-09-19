import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { TaskState, type ActiveTaskEntry } from './task.types.js';
import { resolveActiveTasksFilePath } from './task-manager.js';
import { logger as defaultLogger } from '../../logger/index.js';

export interface RecoveredTaskRecord {
  taskId: string;
  displayId: string;
  projectAlias: string;
  rootPid: number;
  command: string;
  startedAt: string;
  terminated: boolean;
  state: TaskState.FAILED;
  failureReason: 'SERVER_RESTARTED';
}

export interface RecoveryResult {
  recoveredTasks: RecoveredTaskRecord[];
  terminatedPids: number[];
}

export interface RecoveryOptions {
  activeTasksFilePath?: string;
  checkPidAlive?: (pid: number) => boolean;
  killPidTree?: (pid: number) => Promise<boolean> | boolean;
  getSystemBootTime?: () => number;
  logger?: any;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err?.code === 'ESRCH') {
      return false; // No such process
    }
    // EPERM means process exists but we lack permission to signal it
    return true;
  }
}

export async function killProcessTree(pid: number): Promise<boolean> {
  if (!isProcessAlive(pid)) {
    return false;
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, (error) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } else {
      try {
        process.kill(pid, 'SIGKILL');
        resolve(true);
      } catch {
        resolve(false);
      }
    }
  });
}

export async function runStartupRecovery(options?: RecoveryOptions): Promise<RecoveryResult> {
  const filePath = resolveActiveTasksFilePath(options?.activeTasksFilePath);
  const checkAlive = options?.checkPidAlive ?? isProcessAlive;
  const killTree = options?.killPidTree ?? killProcessTree;
  const logger = options?.logger ?? defaultLogger;
  const getBootTime = options?.getSystemBootTime ?? (() => Date.now() - os.uptime() * 1000);
  const systemBootTime = getBootTime();

  const result: RecoveryResult = {
    recoveredTasks: [],
    terminatedPids: [],
  };

  if (!fs.existsSync(filePath)) {
    return result;
  }

  let entries: ActiveTaskEntry[] = [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (item): item is ActiveTaskEntry =>
            Boolean(item && typeof item === 'object' && typeof (item as any).taskId === 'string')
        );
      }
    }
  } catch (err) {
    logger.warn({ err, filePath }, 'Failed to parse active tasks file during recovery. Clearing file.');
    try {
      fs.writeFileSync(filePath, '[]', 'utf-8');
    } catch {
      // Ignore
    }
    return result;
  }

  if (entries.length === 0) {
    return result;
  }

  logger.warn(
    { count: entries.length, tasks: entries.map((e) => e.displayId) },
    'RECOVERY_MODE: Detected orphaned active tasks from prior bot session'
  );

  for (const entry of entries) {
    let terminated = false;
    const taskStartTime = new Date(entry.startedAt).getTime();
    const isPriorToCurrentBoot = Number.isFinite(taskStartTime) && taskStartTime < (systemBootTime - 5000);

    if (isPriorToCurrentBoot) {
      logger.info(
        { rootPid: entry.rootPid, displayId: entry.displayId },
        'RECOVERY_MODE: Task started prior to current system boot. PID recycled by OS; skipping kill.'
      );
    } else {
      const isAlive = checkAlive(entry.rootPid);

      if (isAlive) {
        try {
          terminated = await killTree(entry.rootPid);
          if (terminated) {
            result.terminatedPids.push(entry.rootPid);
            logger.info(
              { rootPid: entry.rootPid, displayId: entry.displayId, command: entry.command },
              'RECOVERY_MODE: Successfully terminated orphaned child process tree'
            );
          } else {
            logger.warn(
              { rootPid: entry.rootPid, displayId: entry.displayId },
              'RECOVERY_MODE: Failed to terminate orphaned child process'
            );
          }
        } catch (killErr) {
          logger.error(
            { rootPid: entry.rootPid, displayId: entry.displayId, err: killErr },
            'RECOVERY_MODE: Error while attempting to terminate orphaned process'
          );
        }
      }
    }

    result.recoveredTasks.push({
      taskId: entry.taskId,
      displayId: entry.displayId,
      projectAlias: entry.projectAlias,
      rootPid: entry.rootPid,
      command: entry.command,
      startedAt: entry.startedAt,
      terminated,
      state: TaskState.FAILED,
      failureReason: 'SERVER_RESTARTED',
    });
  }

  // Clear active tasks file atomically upon completion of recovery
  try {
    fs.writeFileSync(filePath, '[]', 'utf-8');
    logger.info({ filePath }, 'RECOVERY_MODE: Cleared active tasks registry');
  } catch (writeErr) {
    logger.error({ err: writeErr, filePath }, 'RECOVERY_MODE: Failed to wipe active tasks file');
  }

  return result;
}
