import { Bot } from 'grammy';
import { createAllowlistMiddleware } from './middleware/allowlist.js';
import { createStatusHandler } from './handlers/status.js';
import { createProjectsHandler } from './handlers/projects.js';
import type { TelemetryCollectorOptions } from '../core/telemetry.js';
import type { ProjectRegistry } from '../core/project-registry.js';
import { logger } from '../logger/index.js';

export function createBot(
  token: string,
  allowedUserIds: Set<number>,
  customLogger = logger,
  telemetryOptions?: TelemetryCollectorOptions,
  projectRegistry?: ProjectRegistry
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

  return bot;
}
