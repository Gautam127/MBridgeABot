import type { Context, NextFunction } from 'grammy';
import { logger } from '../../logger/index.js';

export function createAllowlistMiddleware(
  allowedUserIds: Set<number>,
  customLogger = logger
) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;

    if (!userId || !allowedUserIds.has(userId)) {
      customLogger.warn(
        {
          securityAudit: true,
          unauthorizedUserId: userId ?? null,
          username: ctx.from?.username ?? null,
          timestamp: new Date().toISOString(),
          attemptedMessage: ctx.message?.text ?? null,
          updateType: Object.keys(ctx.update).find((k) => k !== 'update_id') ?? 'unknown',
        },
        `Unauthorized access attempt dropped for user ID: ${userId ?? 'unknown'}`
      );
      // Silently drop update - no response sent, next() is not called
      return;
    }

    await next();
  };
}
