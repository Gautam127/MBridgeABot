export interface ActiveProcessEntry {
  projectAlias: string; // normalized
  taskId: string;
  displayId: string;
  rootPid: number;
  startedAt: string;
}

export class RuntimeProcessRegistry {
  private processes = new Map<string, ActiveProcessEntry>(); // normalizedAlias -> ActiveProcessEntry

  public normalizeAlias(alias: string): string {
    if (!alias || typeof alias !== 'string' || !alias.trim()) {
      throw new Error('projectAlias must not be empty');
    }
    return alias.trim().toLowerCase();
  }

  public register(entry: {
    projectAlias: string;
    taskId: string;
    displayId: string;
    rootPid: number;
    startedAt?: string;
  }): ActiveProcessEntry {
    const normalized = this.normalizeAlias(entry.projectAlias);
    if (!entry.taskId || typeof entry.taskId !== 'string' || !entry.taskId.trim()) {
      throw new Error('taskId must not be empty');
    }
    if (!Number.isInteger(entry.rootPid) || entry.rootPid <= 0) {
      throw new Error(`Invalid rootPid: ${entry.rootPid}. Must be a positive integer.`);
    }

    const processEntry: ActiveProcessEntry = {
      projectAlias: normalized,
      taskId: entry.taskId.trim(),
      displayId: (entry.displayId && entry.displayId.trim()) || entry.taskId.trim(),
      rootPid: entry.rootPid,
      startedAt: entry.startedAt || new Date().toISOString(),
    };

    this.processes.set(normalized, processEntry);
    return { ...processEntry };
  }

  public unregister(projectAlias: string, taskId?: string): boolean {
    const normalized = this.normalizeAlias(projectAlias);
    const existing = this.processes.get(normalized);

    if (!existing) {
      return false;
    }

    if (taskId && existing.taskId !== taskId.trim()) {
      return false;
    }

    this.processes.delete(normalized);
    return true;
  }

  public getProcess(projectAlias: string): ActiveProcessEntry | undefined {
    const normalized = this.normalizeAlias(projectAlias);
    const entry = this.processes.get(normalized);
    return entry ? { ...entry } : undefined;
  }

  public hasProcess(projectAlias: string): boolean {
    const normalized = this.normalizeAlias(projectAlias);
    return this.processes.has(normalized);
  }

  public getAllProcesses(): ActiveProcessEntry[] {
    return Array.from(this.processes.values()).map((p) => ({ ...p }));
  }

  public clear(): void {
    this.processes.clear();
  }
}

export const defaultProcessRegistry = new RuntimeProcessRegistry();
