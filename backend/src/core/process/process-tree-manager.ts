import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ProcessTreeManagerOptions {
  execFn?: (command: string) => Promise<{ stdout: string; stderr: string }>;
  isAliveFn?: (pid: number) => boolean;
  killFn?: (pid: number, signal?: NodeJS.Signals | number) => void;
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
    // EPERM means process exists but caller lacks permission to signal it
    return true;
  }
}

export class ProcessTreeManager {
  private execFn: (command: string) => Promise<{ stdout: string; stderr: string }>;
  private isAliveFn: (pid: number) => boolean;
  private killFn: (pid: number, signal?: NodeJS.Signals | number) => void;

  constructor(options?: ProcessTreeManagerOptions) {
    this.execFn = options?.execFn ?? execAsync;
    this.isAliveFn = options?.isAliveFn ?? isProcessAlive;
    this.killFn = options?.killFn ?? process.kill.bind(process);
  }

  public isAlive(pid: number): boolean {
    return this.isAliveFn(pid);
  }

  public async kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
    if (!this.isAliveFn(pid)) {
      return true; // Process is already dead
    }

    if (process.platform === 'win32') {
      try {
        await this.execFn(`taskkill /pid ${pid} /T /F`);
        return true;
      } catch {
        // If taskkill fails, verify if process is still alive
        if (!this.isAliveFn(pid)) {
          return true;
        }
        // Fallback to direct process.kill
        try {
          this.killFn(pid, 'SIGKILL');
          return true;
        } catch {
          return !this.isAliveFn(pid);
        }
      }
    }

    // POSIX process tree termination
    // 1. Try sending signal to the process group (-pid)
    try {
      this.killFn(-pid, signal);
    } catch {
      // If process group kill fails (e.g. not group leader), signal the process directly
      try {
        this.killFn(pid, signal);
      } catch {
        // ignore if already exited
      }
    }

    // Give process a small grace period (50ms) to exit cleanly
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (!this.isAliveFn(pid)) {
      return true;
    }

    // 2. Escalate to SIGKILL if still alive
    try {
      this.killFn(-pid, 'SIGKILL');
    } catch {
      try {
        this.killFn(pid, 'SIGKILL');
      } catch {
        // ignore
      }
    }

    // Final check
    return !this.isAliveFn(pid);
  }
}

export const defaultProcessTreeManager = new ProcessTreeManager();
