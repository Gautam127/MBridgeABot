import { describe, it, expect, vi } from 'vitest';
import type { Context, NextFunction } from 'grammy';
import { createAllowlistMiddleware } from '../src/bot/middleware/allowlist.js';
import { createBot } from '../src/bot/bot.js';

describe('Allowlist Middleware & Bot Security (Story 1.1)', () => {
  const allowedUserIds = new Set<number>([12345678, 87654321]);

  function createMockContext(overrides: Partial<Context> = {}): {
    ctx: Context;
    replies: string[];
  } {
    const replies: string[] = [];
    const ctx = {
      from: { id: 12345678, username: 'gautam_dev', is_bot: false, first_name: 'Gautam' },
      message: { text: '/ping', message_id: 1, date: 1700000000, chat: { id: 12345678, type: 'private' } },
      update: { update_id: 1001, message: {} },
      reply: vi.fn(async (text: string) => {
        replies.push(text);
        return {} as any;
      }),
      ...overrides,
    } as unknown as Context;

    return { ctx, replies };
  }

  function createMockLogger() {
    return {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    } as any;
  }

  it('allows authorized user IDs to pass through to downstream handlers', async () => {
    const middleware = createAllowlistMiddleware(allowedUserIds);
    const { ctx } = createMockContext({
      from: { id: 12345678, username: 'authorized_gautam', is_bot: false, first_name: 'Gautam' },
    });

    let nextCalled = false;
    const next: NextFunction = async () => {
      nextCalled = true;
    };

    await middleware(ctx, next);
    expect(nextCalled).toBe(true);
  });

  it('allows second authorized user ID to pass through', async () => {
    const middleware = createAllowlistMiddleware(allowedUserIds);
    const { ctx } = createMockContext({
      from: { id: 87654321, username: 'colleague_dev', is_bot: false, first_name: 'Colleague' },
    });

    let nextCalled = false;
    const next: NextFunction = async () => {
      nextCalled = true;
    };

    await middleware(ctx, next);
    expect(nextCalled).toBe(true);
  });

  it('silently drops updates from unauthorized user IDs and logs structured WARN audit event', async () => {
    const mockLogger = createMockLogger();
    const middleware = createAllowlistMiddleware(allowedUserIds, mockLogger);
    const { ctx } = createMockContext({
      from: { id: 99999999, username: 'malicious_user', is_bot: false, first_name: 'Attacker' },
      message: { text: '/status', message_id: 2, date: 1700000000, chat: { id: 99999999, type: 'private' } } as any,
    });

    let nextCalled = false;
    const next: NextFunction = async () => {
      nextCalled = true;
    };

    await middleware(ctx, next);

    // Assert next handler was NOT called
    expect(nextCalled).toBe(false);

    // Assert no reply was sent
    expect(ctx.reply).not.toHaveBeenCalled();

    // Assert structured security audit log
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [auditPayload, logMessage] = mockLogger.warn.mock.calls[0];
    expect(auditPayload.securityAudit).toBe(true);
    expect(auditPayload.unauthorizedUserId).toBe(99999999);
    expect(auditPayload.username).toBe('malicious_user');
    expect(auditPayload.attemptedMessage).toBe('/status');
    expect(typeof auditPayload.timestamp).toBe('string');
    expect(logMessage).toContain('Unauthorized access attempt dropped for user ID: 99999999');
  });

  it('silently drops updates where ctx.from is missing entirely', async () => {
    const mockLogger = createMockLogger();
    const middleware = createAllowlistMiddleware(allowedUserIds, mockLogger);
    const { ctx } = createMockContext({
      from: undefined,
    });

    let nextCalled = false;
    const next: NextFunction = async () => {
      nextCalled = true;
    };

    await middleware(ctx, next);
    expect(nextCalled).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][0].unauthorizedUserId).toBeNull();
  });

  describe('grammY Bot integration', () => {
    it('responds to /ping when sent by authorized user', async () => {
      const mockLogger = createMockLogger();
      const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger);
      bot.botInfo = { id: 1, is_bot: true, first_name: 'MBridgeBot', username: 'mbridge_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };

      const replies: string[] = [];
      bot.api.config.use((prev, method, payload, signal) => {
        if (method === 'sendMessage') {
          replies.push((payload as any).text);
          return { ok: true, result: { message_id: 123, date: 1700000000, chat: { id: 12345678, type: 'private' } } } as any;
        }
        return prev(method, payload, signal);
      });

      const update = {
        update_id: 1,
        message: {
          message_id: 1,
          date: 1700000000,
          chat: { id: 12345678, type: 'private' },
          from: { id: 12345678, is_bot: false, first_name: 'Gautam', username: 'gautam_dev' },
          text: '/ping',
          entities: [{ type: 'bot_command', offset: 0, length: 5 }],
        },
      };

      await bot.handleUpdate(update as any);
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(replies.length).toBe(1);
      expect(replies[0]).toContain('pong');
    });

    it('responds to /start when sent by authorized user', async () => {
      const mockLogger = createMockLogger();
      const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger);
      bot.botInfo = { id: 1, is_bot: true, first_name: 'MBridgeBot', username: 'mbridge_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };

      const replies: string[] = [];
      bot.api.config.use((prev, method, payload, signal) => {
        if (method === 'sendMessage') {
          replies.push((payload as any).text);
          return { ok: true, result: { message_id: 125, date: 1700000000, chat: { id: 12345678, type: 'private' } } } as any;
        }
        return prev(method, payload, signal);
      });

      const update = {
        update_id: 3,
        message: {
          message_id: 3,
          date: 1700000000,
          chat: { id: 12345678, type: 'private' },
          from: { id: 12345678, is_bot: false, first_name: 'Gautam', username: 'gautam_dev' },
          text: '/start',
          entities: [{ type: 'bot_command', offset: 0, length: 6 }],
        },
      };

      await bot.handleUpdate(update as any);
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(replies.length).toBe(1);
      expect(replies[0]).toContain('Welcome to MBridgeABot');
    });

    it('silently drops /ping when sent by unauthorized user', async () => {
      const mockLogger = createMockLogger();
      const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger);
      bot.botInfo = { id: 1, is_bot: true, first_name: 'MBridgeBot', username: 'mbridge_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };

      const replies: string[] = [];
      bot.api.config.use((prev, method, payload, signal) => {
        if (method === 'sendMessage') {
          replies.push((payload as any).text);
          return { ok: true, result: { message_id: 124, date: 1700000000, chat: { id: 99999999, type: 'private' } } } as any;
        }
        return prev(method, payload, signal);
      });

      const update = {
        update_id: 2,
        message: {
          message_id: 2,
          date: 1700000000,
          chat: { id: 99999999, type: 'private' },
          from: { id: 99999999, is_bot: false, first_name: 'Unknown', username: 'stranger' },
          text: '/ping',
          entities: [{ type: 'bot_command', offset: 0, length: 5 }],
        },
      };

      await bot.handleUpdate(update as any);

      // Warning audit logged
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn.mock.calls[0][0].unauthorizedUserId).toBe(99999999);
      // No replies sent
      expect(replies.length).toBe(0);
    });
  });
});
