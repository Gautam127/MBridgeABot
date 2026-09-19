import { getEnv } from './config/env.js';
import { logger } from './logger/index.js';
import { createBot } from './bot/bot.js';
import { defaultProjectRegistry } from './core/project-registry.js';
import { runStartupRecovery } from './core/task/recovery.js';

async function main() {
  try {
    const env = getEnv();
    logger.info(
      {
        nodeEnv: env.NODE_ENV,
        allowedUsersCount: env.ALLOWED_USER_IDS.size,
      },
      'Starting MBridgeABot backend daemon...'
    );

    // Story 2.1: Startup Recovery Phase
    const recoveryResult = await runStartupRecovery({ logger });
    if (recoveryResult.recoveredTasks.length > 0) {
      logger.warn(
        {
          recoveredCount: recoveryResult.recoveredTasks.length,
          terminatedPids: recoveryResult.terminatedPids,
        },
        'RECOVERY_MODE: Cleaned up orphaned tasks from previous session'
      );
    }

    // Story 1.4: Projects Configuration Loader
    const registry = defaultProjectRegistry;
    registry.loadFromFile();
    logger.info(
      {
        mountedProjectsCount: registry.getProjectCount(),
        projects: registry.getProjectAliases(),
      },
      'Successfully loaded and validated projects.yaml configuration'
    );

    const bot = createBot(
      env.TELEGRAM_BOT_TOKEN,
      env.ALLOWED_USER_IDS,
      logger,
      undefined,
      registry
    );

    // Graceful shutdown handling
    const stopBot = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal. Stopping MBridgeABot...');
      await bot.stop();
      process.exit(0);
    };

    process.once('SIGINT', () => stopBot('SIGINT'));
    process.once('SIGTERM', () => stopBot('SIGTERM'));

    logger.info('Initializing Telegram long-polling...');
    await bot.start({
      onStart: (botInfo) => {
        logger.info(
          {
            botId: botInfo.id,
            username: botInfo.username,
          },
          'MBridgeABot successfully connected to Telegram and is listening for updates.'
        );
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.fatal({ err: error }, `Fatal startup error: ${message}`);
    process.exit(1);
  }
}

// Only execute if run directly
if (process.env.NODE_ENV !== 'test') {
  main();
}
