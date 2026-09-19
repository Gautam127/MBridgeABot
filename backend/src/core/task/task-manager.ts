import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  TaskState,
  isTerminalState,
  type TaskRecord,
  type ActiveTaskEntry,
  type CreateTaskParams,
} from './task.types.js';

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly current: TaskState,
    public readonly target: TaskState,
    public readonly taskId: string
  ) {
    super(
      `Invalid task state transition from "${current}" to "${target}" for task ${taskId}`
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export interface TaskManagerOptions {
  activeTasksFilePath?: string;
}

export function resolveActiveTasksFilePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  if (process.env.ACTIVE_TASKS_FILE_PATH) {
    return path.resolve(process.env.ACTIVE_TASKS_FILE_PATH);
  }

  const candidatePaths = [
    path.resolve(process.cwd(), '.mbridge', 'active-tasks.json'),
    path.resolve(process.cwd(), '..', '.mbridge', 'active-tasks.json'),
    path.resolve(process.cwd(), 'backend', '.mbridge', 'active-tasks.json'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), '.mbridge', 'active-tasks.json');
}

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();
  private displayIdIndex = new Map<string, string>(); // displayId.toLowerCase() -> taskId
  private activeTasksFilePath: string;

  constructor(options?: TaskManagerOptions) {
    this.activeTasksFilePath = resolveActiveTasksFilePath(options?.activeTasksFilePath);
  }

  public generateDisplayId(): string {
    let displayId = '';
    do {
      displayId = crypto.randomBytes(3).toString('hex').toLowerCase();
    } while (this.displayIdIndex.has(displayId));
    return displayId;
  }

  public createTask(params: CreateTaskParams): TaskRecord {
    if (!params || typeof params !== 'object') {
      throw new Error('Task parameters must be provided');
    }
    if (!params.projectAlias || typeof params.projectAlias !== 'string' || !params.projectAlias.trim()) {
      throw new Error('projectAlias must not be empty');
    }
    if (!params.command || typeof params.command !== 'string' || !params.command.trim()) {
      throw new Error('command must not be empty');
    }

    const taskId = crypto.randomUUID();
    const displayId = this.generateDisplayId();
    const now = new Date().toISOString();

    const record: TaskRecord = {
      taskId,
      displayId,
      projectAlias: params.projectAlias.trim().toLowerCase(),
      command: params.command.trim(),
      state: TaskState.QUEUED,
      createdAt: now,
    };

    this.tasks.set(taskId, record);
    this.displayIdIndex.set(displayId, taskId);

    return { ...record };
  }

  public startTask(taskId: string, rootPid: number): TaskRecord {
    const task = this.getRequiredTask(taskId);

    if (task.state !== TaskState.QUEUED) {
      throw new InvalidStateTransitionError(task.state, TaskState.RUNNING, task.taskId);
    }

    if (!Number.isInteger(rootPid) || rootPid <= 0) {
      throw new Error(`Invalid rootPid: ${rootPid}. Must be a positive integer.`);
    }

    const now = new Date().toISOString();
    task.state = TaskState.RUNNING;
    task.rootPid = rootPid;
    task.startedAt = now;

    this.persistActiveTask(task);

    return { ...task };
  }

  public completeTask(taskId: string, exitCode: number = 0): TaskRecord {
    const task = this.getRequiredTask(taskId);

    if (task.state !== TaskState.RUNNING) {
      throw new InvalidStateTransitionError(task.state, TaskState.COMPLETED, task.taskId);
    }

    const now = new Date().toISOString();
    task.state = TaskState.COMPLETED;
    task.completedAt = now;
    task.exitCode = exitCode;

    this.removeActiveTask(task.taskId);

    return { ...task };
  }

  public failTask(
    taskId: string,
    reason: string = 'FAILED',
    exitCode: number | null = null
  ): TaskRecord {
    const task = this.getRequiredTask(taskId);

    if (isTerminalState(task.state)) {
      throw new InvalidStateTransitionError(task.state, TaskState.FAILED, task.taskId);
    }

    const now = new Date().toISOString();
    task.state = TaskState.FAILED;
    task.completedAt = now;
    task.failureReason = reason;
    task.exitCode = exitCode;

    this.removeActiveTask(task.taskId);

    return { ...task };
  }

  public cancelTask(taskId: string, reason: string = 'User requested cancellation'): TaskRecord {
    const task = this.getRequiredTask(taskId);

    if (isTerminalState(task.state)) {
      throw new InvalidStateTransitionError(task.state, TaskState.CANCELLED, task.taskId);
    }

    const now = new Date().toISOString();
    task.state = TaskState.CANCELLED;
    task.completedAt = now;
    task.failureReason = reason;

    this.removeActiveTask(task.taskId);

    return { ...task };
  }

  public timeoutTask(taskId: string, reason: string = 'Task execution timed out'): TaskRecord {
    const task = this.getRequiredTask(taskId);

    if (task.state !== TaskState.RUNNING) {
      throw new InvalidStateTransitionError(task.state, TaskState.TIMED_OUT, task.taskId);
    }

    const now = new Date().toISOString();
    task.state = TaskState.TIMED_OUT;
    task.completedAt = now;
    task.failureReason = reason;

    this.removeActiveTask(task.taskId);

    return { ...task };
  }

  public getTask(taskIdOrDisplayId?: string | null): TaskRecord | undefined {
    if (!taskIdOrDisplayId || typeof taskIdOrDisplayId !== 'string') {
      return undefined;
    }

    const trimmed = taskIdOrDisplayId.trim();

    // Check direct UUID lookup
    if (this.tasks.has(trimmed)) {
      return { ...this.tasks.get(trimmed)! };
    }

    // Check displayId index
    const resolvedTaskId = this.displayIdIndex.get(trimmed.toLowerCase());
    if (resolvedTaskId && this.tasks.has(resolvedTaskId)) {
      return { ...this.tasks.get(resolvedTaskId)! };
    }

    return undefined;
  }

  public getActiveTasks(): TaskRecord[] {
    return Array.from(this.tasks.values())
      .filter((task) => task.state === TaskState.RUNNING)
      .map((t) => ({ ...t }));
  }

  public getAllTasks(): TaskRecord[] {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }));
  }

  public clear(): void {
    this.tasks.clear();
    this.displayIdIndex.clear();
    this.writeActiveTasksFile([]);
  }

  private getRequiredTask(taskIdOrDisplayId: string): TaskRecord {
    const task = this.getTask(taskIdOrDisplayId);
    if (!task) {
      throw new Error(`Task not found: "${taskIdOrDisplayId}"`);
    }
    // Return the internal mutable reference stored in map
    return this.tasks.get(task.taskId)!;
  }

  public readActiveTasksFile(): ActiveTaskEntry[] {
    try {
      if (!fs.existsSync(this.activeTasksFilePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.activeTasksFilePath, 'utf-8');
      if (!raw || !raw.trim()) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (item): item is ActiveTaskEntry =>
          Boolean(item && typeof item === 'object' && typeof (item as any).taskId === 'string')
      );
    } catch {
      return [];
    }
  }

  public writeActiveTasksFile(entries: ActiveTaskEntry[]): void {
    try {
      const dir = path.dirname(this.activeTasksFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpFile = `${this.activeTasksFilePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(entries, null, 2), 'utf-8');
      try {
        fs.renameSync(tmpFile, this.activeTasksFilePath);
      } catch {
        fs.copyFileSync(tmpFile, this.activeTasksFilePath);
        try {
          fs.unlinkSync(tmpFile);
        } catch {
          // ignore
        }
      }
    } catch {
      // Best-effort atomic write
    }
  }

  private persistActiveTask(task: TaskRecord): void {
    if (!task.rootPid || !task.startedAt) {
      return;
    }

    const currentEntries = this.readActiveTasksFile().filter(
      (e) => e.taskId !== task.taskId
    );

    const newEntry: ActiveTaskEntry = {
      taskId: task.taskId,
      displayId: task.displayId,
      projectAlias: task.projectAlias,
      rootPid: task.rootPid,
      command: task.command,
      startedAt: task.startedAt,
    };

    currentEntries.push(newEntry);
    this.writeActiveTasksFile(currentEntries);
  }

  private removeActiveTask(taskId: string): void {
    const currentEntries = this.readActiveTasksFile().filter(
      (e) => e.taskId !== taskId
    );
    this.writeActiveTasksFile(currentEntries);
  }
}

export const defaultTaskManager = new TaskManager();
