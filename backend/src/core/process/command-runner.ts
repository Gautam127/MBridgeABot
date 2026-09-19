import { spawn, type ChildProcess } from 'node:child_process';
import { killProcessTree } from '../task/recovery.js';

export interface RunCommandOptions {
  command: string;
  cwd: string;
  timeoutSeconds?: number;
  onSpawn?: (pid: number) => void;
  env?: Record<string, string>;
}

export interface CommandRunResult {
  exitCode: number | null;
  output: string;
  stdout: string;
  stderr: string;
  durationSeconds: number;
  timedOut: boolean;
}

export function sanitizeChildEnv(customEnv?: Record<string, string>): Record<string, string> {
  const baseEnv: Record<string, string> = {};

  // Forward standard host environment while strictly excluding MBridge bot secrets
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // Strip MBridge secrets from child environment
    if (
      key === 'TELEGRAM_BOT_TOKEN' ||
      key === 'ALLOWED_USER_IDS' ||
      key.startsWith('MBRIDGE_SECRET_')
    ) {
      continue;
    }
    baseEnv[key] = value;
  }

  // Non-interactive execution guard flags
  baseEnv.CI = 'true';
  baseEnv.FORCE_COLOR = '0';
  baseEnv.TERM = 'dumb';

  if (customEnv) {
    Object.assign(baseEnv, customEnv);
  }

  return baseEnv;
}

export async function runCommand(options: RunCommandOptions): Promise<CommandRunResult> {
  const { command, cwd, timeoutSeconds = 600, onSpawn, env } = options;
  const startTime = Date.now();

  const childEnv = sanitizeChildEnv(env);

  return new Promise((resolve) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let combinedBuffer = '';
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;
    let child: ChildProcess | null = null;

    try {
      // Spawn using shell to properly execute complex command strings (e.g. "npm run build")
      child = spawn(command, {
        cwd,
        env: childEnv,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const pid = child.pid;
      if (pid && onSpawn) {
        onSpawn(pid);
      }

      if (timeoutSeconds > 0 && pid) {
        timer = setTimeout(async () => {
          timedOut = true;
          await killProcessTree(pid);
        }, timeoutSeconds * 1000);
      }

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        stdoutBuffer += text;
        combinedBuffer += text;
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderrBuffer += text;
        combinedBuffer += text;
      });

      child.on('close', (exitCode) => {
        if (timer) {
          clearTimeout(timer);
        }
        const durationSeconds = (Date.now() - startTime) / 1000;
        resolve({
          exitCode: timedOut ? 124 : exitCode,
          output: combinedBuffer,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          durationSeconds,
          timedOut,
        });
      });

      child.on('error', (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        const durationSeconds = (Date.now() - startTime) / 1000;
        const errText = `\nFailed to start process: ${err.message}`;
        resolve({
          exitCode: 1,
          output: combinedBuffer + errText,
          stdout: stdoutBuffer,
          stderr: stderrBuffer + errText,
          durationSeconds,
          timedOut: false,
        });
      });
    } catch (err: any) {
      if (timer) {
        clearTimeout(timer);
      }
      const durationSeconds = (Date.now() - startTime) / 1000;
      resolve({
        exitCode: 1,
        output: `Error launching command: ${err?.message || String(err)}`,
        stdout: '',
        stderr: err?.message || String(err),
        durationSeconds,
        timedOut: false,
      });
    }
  });
}
