export enum TaskState {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT',
}

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  TaskState.COMPLETED,
  TaskState.FAILED,
  TaskState.CANCELLED,
  TaskState.TIMED_OUT,
]);

export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_STATES.has(state);
}

export interface TaskRecord {
  taskId: string;
  displayId: string;
  projectAlias: string;
  command: string;
  state: TaskState;
  rootPid?: number;
  startedAt?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
  exitCode?: number | null;
}

export interface ActiveTaskEntry {
  taskId: string;
  displayId: string;
  projectAlias: string;
  rootPid: number;
  command: string;
  startedAt: string;
}

export interface CreateTaskParams {
  projectAlias: string;
  command: string;
}
