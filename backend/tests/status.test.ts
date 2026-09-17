import { describe, it, expect, vi } from 'vitest';
import type { Context } from 'grammy';
import {
  formatUptime,
  bytesToGb,
  countProjectsFromYamlContent,
  getMountedProjectsCount,
  getSystemTelemetry,
  formatTelemetryMessage,
} from '../src/core/telemetry.js';
import { createStatusHandler } from '../src/bot/handlers/status.js';
import { createBot } from '../src/bot/bot.js';

describe('Workstation Telemetry Helpers (Story 1.3)', () => {
  describe('formatUptime', () => {
    it('formats seconds', () => {
      expect(formatUptime(45)).toBe('45s');
      expect(formatUptime(0)).toBe('0s');
      expect(formatUptime(-5)).toBe('0s');
    });

    it('formats minutes and seconds', () => {
      expect(formatUptime(125)).toBe('2m 5s');
      expect(formatUptime(60)).toBe('1m 0s');
    });

    it('formats hours, minutes and seconds', () => {
      expect(formatUptime(3665)).toBe('1h 1m 5s');
      expect(formatUptime(7200)).toBe('2h 0m 0s');
    });

    it('formats days, hours and minutes', () => {
      expect(formatUptime(90000)).toBe('1d 1h 0m');
      expect(formatUptime(172800 + 3600)).toBe('2d 1h 0m');
    });

    it('handles NaN, Infinity and non-numeric inputs safely', () => {
      expect(formatUptime(NaN)).toBe('0s');
      expect(formatUptime(Infinity)).toBe('0s');
      expect(formatUptime(-100)).toBe('0s');
    });
  });

  describe('bytesToGb', () => {
    it('converts byte quantities to gigabytes rounded to 1 decimal place', () => {
      expect(bytesToGb(1024 * 1024 * 1024)).toBe(1);
      expect(bytesToGb(16 * 1024 * 1024 * 1024)).toBe(16);
      expect(bytesToGb(18.55 * 1024 * 1024 * 1024)).toBe(18.6);
      expect(bytesToGb(0)).toBe(0);
      expect(bytesToGb(-100)).toBe(0);
    });

    it('handles NaN and negative inputs safely', () => {
      expect(bytesToGb(NaN)).toBe(0);
      expect(bytesToGb(-50)).toBe(0);
    });
  });

  describe('countProjectsFromYamlContent', () => {
    it('counts projects configured under the projects key', () => {
      const yaml = `
projects:
  ecommerce:
    path: "D:/Projects/ecommerce"
    build: "npm run build"
  billing-api:
    path: "D:/Projects/billing-api"
    build: "cargo build"
`;
      expect(countProjectsFromYamlContent(yaml)).toBe(2);
    });

    it('handles comments and empty lines inside projects yaml', () => {
      const yaml = `
# Project registry configuration
projects:
  # Main store
  ecommerce:
    path: "D:/Projects/ecommerce"

  # Internal billing service
  billing-api:
    path: "D:/Projects/billing-api"

  worker-service:
    path: "D:/Projects/worker"
`;
      expect(countProjectsFromYamlContent(yaml)).toBe(3);
    });

    it('returns 0 when projects section is missing or empty', () => {
      expect(countProjectsFromYamlContent('')).toBe(0);
      expect(countProjectsFromYamlContent('version: "1.0"\nsettings:\n  debug: true')).toBe(0);
    });
  });

  describe('getMountedProjectsCount', () => {
    it('returns 0 gracefully if the configuration file does not exist', () => {
      expect(getMountedProjectsCount('non_existent_file_path_12345.yaml')).toBe(0);
    });
  });

  describe('getSystemTelemetry', () => {
    it('collects real host metrics by default', () => {
      const telemetry = getSystemTelemetry();

      expect(typeof telemetry.botUptimeSeconds).toBe('number');
      expect(typeof telemetry.formattedBotUptime).toBe('string');
      expect(typeof telemetry.platform).toBe('string');
      expect(typeof telemetry.osRelease).toBe('string');
      expect(typeof telemetry.nodeVersion).toBe('string');
      expect(telemetry.nodeVersion.startsWith('v')).toBe(true);
      expect(telemetry.freeMemoryBytes).toBeGreaterThan(0);
      expect(telemetry.totalMemoryBytes).toBeGreaterThan(0);
      expect(telemetry.totalMemoryGb).toBeGreaterThanOrEqual(telemetry.freeMemoryGb);
      expect(typeof telemetry.mountedProjectsCount).toBe('number');
    });

    it('supports custom options and mock values', () => {
      const telemetry = getSystemTelemetry({
        botUptime: 3600,
        hostUptime: 86400,
        platform: 'win32',
        osRelease: '10.0.22631',
        nodeVersion: 'v22.14.0',
        freeMemoryBytes: 16 * 1024 * 1024 * 1024,
        totalMemoryBytes: 32 * 1024 * 1024 * 1024,
        projectCount: 4,
      });

      expect(telemetry.formattedBotUptime).toBe('1h 0m 0s');
      expect(telemetry.formattedHostUptime).toBe('1d 0h 0m');
      expect(telemetry.platform).toBe('win32');
      expect(telemetry.freeMemoryGb).toBe(16);
      expect(telemetry.totalMemoryGb).toBe(32);
      expect(telemetry.mountedProjectsCount).toBe(4);
    });
  });

  describe('formatTelemetryMessage', () => {
    it('formats clean Markdown containing all required AC fields and next-step hint', () => {
      const telemetry = {
        botUptimeSeconds: 1500,
        formattedBotUptime: '25m 0s',
        hostUptimeSeconds: 72000,
        formattedHostUptime: '20h 0m 0s',
        platform: 'win32',
        osRelease: '10.0.22631',
        nodeVersion: 'v22.14.0',
        freeMemoryBytes: 8 * 1024 * 1024 * 1024,
        totalMemoryBytes: 16 * 1024 * 1024 * 1024,
        freeMemoryGb: 8,
        totalMemoryGb: 16,
        mountedProjectsCount: 2,
      };

      const message = formatTelemetryMessage(telemetry);

      expect(message).toContain('MBridgeABot Status — Workstation Online');
      expect(message).toContain('Bot Uptime:* 25m 0s');
      expect(message).toContain('Host: 20h 0m 0s');
      expect(message).toContain('System RAM:* 8 GB free / 16 GB total');
      expect(message).toContain('Node Runtime:* v22.14.0 (win32 10.0.22631)');
      expect(message).toContain('Mounted Projects:* 2');
      expect(message).toContain('Next:');
      expect(message).toContain('/projects');
    });

    it('escapes Markdown special characters in dynamic telemetry strings', () => {
      const telemetry = {
        botUptimeSeconds: 60,
        formattedBotUptime: '1m 0s',
        hostUptimeSeconds: 120,
        formattedHostUptime: '2m 0s',
        platform: 'linux_x86',
        osRelease: '5.15.0-88-generic_x86_64',
        nodeVersion: 'v22.14.0_beta',
        freeMemoryBytes: 8 * 1024 * 1024 * 1024,
        totalMemoryBytes: 16 * 1024 * 1024 * 1024,
        freeMemoryGb: 8,
        totalMemoryGb: 16,
        mountedProjectsCount: 2,
      };

      const message = formatTelemetryMessage(telemetry);
      expect(message).toContain('linux\\_x86');
      expect(message).toContain('5.15.0-88-generic\\_x86\\_64');
      expect(message).toContain('v22.14.0\\_beta');
    });
  });
});

describe('Status Command Handler & Matrix Audit (Story 1.3)', () => {
  const allowedUserIds = new Set<number>([12345678]);

  function createMockLogger() {
    return {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    } as any;
  }

  // Matrix Row 1: Authorized /status Query
  it('Matrix Row 1: Authorized /status Query replies within 2.0s with formatted Markdown telemetry', async () => {
    const mockLogger = createMockLogger();
    const telemetryOptions = {
      botUptime: 7200,
      hostUptime: 172800,
      platform: 'win32',
      osRelease: '10.0.22631',
      nodeVersion: 'v22.14.0',
      freeMemoryBytes: 14.5 * 1024 * 1024 * 1024,
      totalMemoryBytes: 32 * 1024 * 1024 * 1024,
      projectCount: 3,
    };

    const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger, telemetryOptions);
    bot.botInfo = {
      id: 1,
      is_bot: true,
      first_name: 'MBridgeBot',
      username: 'mbridge_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    };

    const replies: Array<{ text: string; parse_mode?: string }> = [];
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'sendMessage') {
        replies.push({
          text: (payload as any).text,
          parse_mode: (payload as any).parse_mode,
        });
        return {
          ok: true,
          result: { message_id: 123, date: 1700000000, chat: { id: 12345678, type: 'private' } },
        } as any;
      }
      return prev(method, payload, signal);
    });

    const startTime = performance.now();
    const update = {
      update_id: 10,
      message: {
        message_id: 10,
        date: 1700000000,
        chat: { id: 12345678, type: 'private' },
        from: { id: 12345678, is_bot: false, first_name: 'Gautam', username: 'gautam_dev' },
        text: '/status',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
      },
    };

    await bot.handleUpdate(update as any);
    const durationMs = performance.now() - startTime;

    // SLA Assertion: Must reply well within 2.0 seconds (2000ms)
    expect(durationMs).toBeLessThan(2000);

    expect(replies.length).toBe(1);
    const reply = replies[0];
    expect(reply.parse_mode).toBe('Markdown');
    expect(reply.text).toContain('MBridgeABot Status');
    expect(reply.text).toContain('Bot Uptime:* 2h 0m 0s');
    expect(reply.text).toContain('System RAM:* 14.5 GB free / 32 GB total');
    expect(reply.text).toContain('Node Runtime:* v22.14.0');
    expect(reply.text).toContain('Mounted Projects:* 3');
    expect(reply.text).toContain('Next:');
  });

  // Matrix Row 2: High Load / Low Memory scenario
  it('Matrix Row 2: High Load / Low Memory accurately reports low available RAM in GB', async () => {
    const mockLogger = createMockLogger();
    const lowMemOptions = {
      botUptime: 600,
      hostUptime: 3600,
      freeMemoryBytes: 512 * 1024 * 1024, // 0.5 GB free
      totalMemoryBytes: 16 * 1024 * 1024 * 1024, // 16 GB total
      projectCount: 1,
    };

    const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger, lowMemOptions);
    bot.botInfo = {
      id: 1,
      is_bot: true,
      first_name: 'MBridgeBot',
      username: 'mbridge_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    };

    const replies: Array<{ text: string }> = [];
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'sendMessage') {
        replies.push({ text: (payload as any).text });
        return {
          ok: true,
          result: { message_id: 124, date: 1700000000, chat: { id: 12345678, type: 'private' } },
        } as any;
      }
      return prev(method, payload, signal);
    });

    const update = {
      update_id: 11,
      message: {
        message_id: 11,
        date: 1700000000,
        chat: { id: 12345678, type: 'private' },
        from: { id: 12345678, is_bot: false, first_name: 'Gautam', username: 'gautam_dev' },
        text: '/status',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
      },
    };

    await bot.handleUpdate(update as any);

    expect(replies.length).toBe(1);
    expect(replies[0].text).toContain('System RAM:* 0.5 GB free / 16 GB total');
  });

  it('silently drops /status query from unauthorized user IDs', async () => {
    const mockLogger = createMockLogger();
    const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger);
    bot.botInfo = {
      id: 1,
      is_bot: true,
      first_name: 'MBridgeBot',
      username: 'mbridge_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    };

    const replies: string[] = [];
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'sendMessage') {
        replies.push((payload as any).text);
        return {
          ok: true,
          result: { message_id: 125, date: 1700000000, chat: { id: 99999999, type: 'private' } },
        } as any;
      }
      return prev(method, payload, signal);
    });

    const update = {
      update_id: 12,
      message: {
        message_id: 12,
        date: 1700000000,
        chat: { id: 99999999, type: 'private' },
        from: { id: 99999999, is_bot: false, first_name: 'Attacker', username: 'attacker' },
        text: '/status',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
      },
    };

    await bot.handleUpdate(update as any);

    // Assert silent drop
    expect(replies.length).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][0].unauthorizedUserId).toBe(99999999);
  });

  it('executes /status with default options and connects to ProjectRegistry when provided', async () => {
    const mockLogger = createMockLogger();
    const mockRegistry = {
      getProjectCount: vi.fn().mockReturnValue(5),
    } as any;

    const bot = createBot('fake-token:ABC', allowedUserIds, mockLogger, undefined, mockRegistry);
    bot.botInfo = {
      id: 1,
      is_bot: true,
      first_name: 'MBridgeBot',
      username: 'mbridge_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    };

    const replies: Array<{ text: string; parse_mode?: string }> = [];
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'sendMessage') {
        replies.push({
          text: (payload as any).text,
          parse_mode: (payload as any).parse_mode,
        });
        return {
          ok: true,
          result: { message_id: 126, date: 1700000000, chat: { id: 12345678, type: 'private' } },
        } as any;
      }
      return prev(method, payload, signal);
    });

    const update = {
      update_id: 13,
      message: {
        message_id: 13,
        date: 1700000000,
        chat: { id: 12345678, type: 'private' },
        from: { id: 12345678, is_bot: false, first_name: 'Gautam', username: 'gautam_dev' },
        text: '/status',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
      },
    };

    await bot.handleUpdate(update as any);

    expect(replies.length).toBe(1);
    expect(replies[0].parse_mode).toBe('Markdown');
    expect(replies[0].text).toContain('Mounted Projects:* 5');
    expect(mockRegistry.getProjectCount).toHaveBeenCalled();
  });
});
