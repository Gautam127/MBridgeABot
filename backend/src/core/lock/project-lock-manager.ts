export interface ProjectLock {
  projectAlias: string;
  taskId: string;
  displayId: string;
  acquiredAt: string;
}

export class ProjectLockedError extends Error {
  public readonly statusCode = 409;
  public readonly projectAlias: string;
  public readonly taskId: string;
  public readonly displayId: string;

  constructor(projectAlias: string, taskId: string, displayId: string) {
    const formattedDisplayId = displayId ? `[${displayId}]` : `[${taskId}]`;
    const message = `⚠️ Project "${projectAlias}" is busy running task ${formattedDisplayId}. Use /cancel ${projectAlias} to abort it first.`;
    super(message);
    this.name = 'ProjectLockedError';
    this.projectAlias = projectAlias;
    this.taskId = taskId;
    this.displayId = displayId;
  }
}

export class ProjectLockManager {
  private locks = new Map<string, ProjectLock>(); // normalizedAlias -> ProjectLock

  public normalizeAlias(alias: string): string {
    if (!alias || typeof alias !== 'string' || !alias.trim()) {
      throw new Error('projectAlias must not be empty');
    }
    return alias.trim().toLowerCase();
  }

  public isLocked(alias: string): boolean {
    const normalized = this.normalizeAlias(alias);
    return this.locks.has(normalized);
  }

  public getLock(alias: string): ProjectLock | undefined {
    const normalized = this.normalizeAlias(alias);
    const lock = this.locks.get(normalized);
    return lock ? { ...lock } : undefined;
  }

  public acquire(alias: string, taskId: string, displayId?: string): ProjectLock {
    const normalized = this.normalizeAlias(alias);
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      throw new Error('taskId must not be empty');
    }

    const currentLock = this.locks.get(normalized);
    if (currentLock) {
      throw new ProjectLockedError(normalized, currentLock.taskId, currentLock.displayId);
    }

    const resolvedDisplayId = (displayId && displayId.trim()) || taskId.trim();
    const lock: ProjectLock = {
      projectAlias: normalized,
      taskId: taskId.trim(),
      displayId: resolvedDisplayId,
      acquiredAt: new Date().toISOString(),
    };

    this.locks.set(normalized, lock);
    return { ...lock };
  }

  public tryAcquire(alias: string, taskId: string, displayId?: string): boolean {
    try {
      this.acquire(alias, taskId, displayId);
      return true;
    } catch (err) {
      if (err instanceof ProjectLockedError) {
        return false;
      }
      throw err;
    }
  }

  public release(alias: string, taskId?: string): boolean {
    const normalized = this.normalizeAlias(alias);
    const currentLock = this.locks.get(normalized);

    if (!currentLock) {
      return false;
    }

    if (taskId && currentLock.taskId !== taskId.trim()) {
      return false;
    }

    this.locks.delete(normalized);
    return true;
  }

  public async withLock<T>(
    alias: string,
    taskId: string,
    displayId: string,
    action: () => Promise<T> | T
  ): Promise<T> {
    this.acquire(alias, taskId, displayId);
    try {
      return await action();
    } finally {
      this.release(alias, taskId);
    }
  }

  public getActiveLocks(): ProjectLock[] {
    return Array.from(this.locks.values()).map((l) => ({ ...l }));
  }

  public clear(): void {
    this.locks.clear();
  }
}

export const defaultProjectLockManager = new ProjectLockManager();
