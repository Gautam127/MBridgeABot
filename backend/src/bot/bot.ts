import { Bot } from 'grammy';
import { createAllowlistMiddleware } from './middleware/allowlist.js';
import { createStatusHandler } from './handlers/status.js';
import { createProjectsHandler } from './handlers/projects.js';
import { createBuildHandler } from './handlers/build.js';
import { createTestHandler } from './handlers/test.js';
import { createCancelHandler } from './handlers/cancel.js';
import type { TelemetryCollectorOptions } from '../core/telemetry.js';
import type { ProjectRegistry } from '../core/project-registry.js';
import type { TaskManager } from '../core/task/task-manager.js';
import type { ProjectLockManager } from '../core/lock/project-lock-manager.js';
import type { RuntimeProcessRegistry } from '../core/task/process-registry.js';
import type { ProcessTreeManager } from '../core/process/process-tree-manager.js';
import type { RunCommandOptions, CommandRunResult } from '../core/process/command-runner.js';
import { logger } from '../logger/index.js';

export function createBot(
  token: string,
  allowedUserIds: Set<number>,
  customLogger = logger,
  telemetryOptions?: TelemetryCollectorOptions,
  projectRegistry?: ProjectRegistry,
  taskManager?: TaskManager,
  lockManager?: ProjectLockManager,
  commandRunner?: (options: RunCommandOptions) => Promise<CommandRunResult>,
  processRegistry?: RuntimeProcessRegistry,
  processTreeManager?: ProcessTreeManager
) {
  const bot = new Bot(token);

  // Error handling
  bot.catch((err) => {
    customLogger.error(
      {
        err: err.error,
        ctx: {
          updateId: err.ctx.update.update_id,
          userId: err.ctx.from?.id,
        },
      },
      'Unhandled error in Telegram bot update handler'
    );
  });

  // Security layer: FR-1 Silent Drop Allowlist Middleware
  bot.use(createAllowlistMiddleware(allowedUserIds, customLogger));

  // Basic health / connectivity check for authorized users
  bot.command('ping', async (ctx) => {
    await ctx.reply('pong 🏓 | MBridgeABot is online');
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(
      '👋 Welcome to MBridgeABot — Remote AI Dev Assistant & Workstation Bridge.\n\nUse /ping to test connection or /status to inspect vitals.'
    );
  });

  // Story 1.3: Workstation Telemetry & System Status Command
  const effectiveTelemetryOptions: TelemetryCollectorOptions = {
    ...telemetryOptions,
    ...(projectRegistry && !telemetryOptions?.getProjectCount && telemetryOptions?.projectCount === undefined
      ? { getProjectCount: () => projectRegistry.getProjectCount() }
      : {}),
  };
  bot.command('status', createStatusHandler(effectiveTelemetryOptions));

  // Story 1.4: Projects Configuration Loader & Registry Command
  bot.command('projects', createProjectsHandler(projectRegistry));

  // Story 2.4: Project Build & Test Commands with Bounded Telegram Reporting
  const executionDeps = {
    projectRegistry,
    taskManager,
    lockManager,
    processRegistry,
    runner: commandRunner,
  };
  bot.command('build', createBuildHandler(executionDeps));
  bot.command('test', createTestHandler(executionDeps));

  // Story 2.5: Process Cancellation Command (/cancel)
  const cancelDeps = {
    projectRegistry,
    taskManager,
    lockManager,
    processRegistry,
    processTreeManager,
  };
  bot.command('cancel', createCancelHandler(cancelDeps));

  return bot;
}
