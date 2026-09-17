import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Context } from 'grammy';
import {
  projectEntrySchema,
  projectsConfigSchema,
  validateProjectsConfig,
  parseProjectsYaml,
  type ProjectConfig,
} from '../src/config/projects.schema.js';
import {
  ProjectRegistry,
  loadProjectsConfig,
  resolveProjectsConfigPath,
  defaultProjectRegistry,
} from '../src/core/project-registry.js';
import {
  formatProjectsMessage,
  createProjectsHandler,
} from '../src/bot/handlers/projects.js';
import { createBot } from '../src/bot/bot.js';

describe('Story 1.4: Projects Configuration Loader & Registry Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbridge-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Zod Schema Validation (src/config/projects.schema.ts)', () => {
    it('validates a valid project entry and normalizes alias to lowercase', () => {
      const parsed = projectEntrySchema.parse({
        alias: 'ECommerce-Service',
        path: 'D:/Projects/ecommerce',
        buildCmd: 'npm run build',
        testCmd: 'npm test',
        agentProvider: 'antigravity',
      });

      expect(parsed.alias).toBe('ecommerce-service');
      expect(parsed.path).toBe('D:/Projects/ecommerce');
      expect(parsed.buildCmd).toBe('npm run build');
      expect(parsed.testCmd).toBe('npm test');
      expect(parsed.agentProvider).toBe('antigravity');
    });

    it('trims leading and trailing whitespace from alias and normalizes to lowercase', () => {
      const parsed = projectEntrySchema.parse({
        alias: '  Billing-Service  ',
        path: 'D:/Projects/billing',
        buildCmd: 'cargo build',
        testCmd: 'cargo test',
        agentProvider: 'antigravity',
      });

      expect(parsed.alias).toBe('billing-service');
    });

    it('rejects alias consisting only of whitespace', () => {
      expect(() =>
        projectEntrySchema.parse({
          alias: '   ',
          path: 'D:/Projects/billing',
          buildCmd: 'cargo build',
          testCmd: 'cargo test',
          agentProvider: 'antigravity',
        })
      ).toThrow();
    });

    it('rejects project entry if alias is missing or empty', () => {
      expect(() =>
        projectEntrySchema.parse({
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        })
      ).toThrow();

      expect(() =>
        projectEntrySchema.parse({
          alias: '',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        })
      ).toThrow();
    });

    it('rejects project entry if path is missing or empty', () => {
      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        })
      ).toThrow();

      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: '',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        })
      ).toThrow();
    });

    it('rejects project entry if buildCmd is missing or empty', () => {
      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        })
      ).toThrow();

      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: '',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        })
      ).toThrow();
    });

    it('rejects project entry if testCmd is missing or empty', () => {
      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          agentProvider: 'antigravity',
        })
      ).toThrow();

      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: '',
          agentProvider: 'antigravity',
        })
      ).toThrow();
    });

    it('rejects project entry if agentProvider is missing or empty', () => {
      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
        })
      ).toThrow();

      expect(() =>
        projectEntrySchema.parse({
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: '',
        })
      ).toThrow();
    });

    it('supports optional timeoutSeconds and testScreenshotsDir', () => {
      const parsed = projectEntrySchema.parse({
        alias: 'ecommerce',
        path: 'D:/Projects/ecommerce',
        buildCmd: 'npm run build',
        testCmd: 'npm test',
        agentProvider: 'antigravity',
        timeoutSeconds: 300,
        testScreenshotsDir: 'reports/screenshots',
      });

      expect(parsed.timeoutSeconds).toBe(300);
      expect(parsed.testScreenshotsDir).toBe('reports/screenshots');
    });

    it('validates configuration with dictionary/map of projects', () => {
      const raw = {
        projects: {
          ecommerce: {
            path: 'D:/Projects/ecommerce',
            buildCmd: 'npm run build',
            testCmd: 'npm test',
            agentProvider: 'antigravity',
          },
          'billing-api': {
            path: 'D:/Projects/billing-api',
            buildCmd: 'cargo build',
            testCmd: 'cargo test',
            agentProvider: 'antigravity',
          },
        },
      };

      const projects = validateProjectsConfig(raw);
      expect(projects).toHaveLength(2);
      expect(projects[0].alias).toBe('ecommerce');
      expect(projects[1].alias).toBe('billing-api');
    });

    it('validates configuration with list of projects', () => {
      const raw = {
        projects: [
          {
            alias: 'ECOMMERCE',
            path: 'D:/Projects/ecommerce',
            buildCmd: 'npm run build',
            testCmd: 'npm test',
            agentProvider: 'antigravity',
          },
        ],
      };

      const projects = validateProjectsConfig(raw);
      expect(projects).toHaveLength(1);
      expect(projects[0].alias).toBe('ecommerce');
    });

    it('throws descriptive error on validation failure with path details', () => {
      const invalid = {
        projects: {
          ecommerce: {
            path: 'D:/Projects/ecommerce',
            // buildCmd missing
            testCmd: 'npm test',
            agentProvider: 'antigravity',
          },
        },
      };

      expect(() => validateProjectsConfig(invalid)).toThrowError(
        /Projects configuration validation failed:.*buildCmd/s
      );
    });

    it('parses valid YAML string correctly', () => {
      const yaml = `
projects:
  Ecommerce:
    path: "D:/Projects/ecommerce"
    buildCmd: "npm run build"
    testCmd: "npm test"
    agentProvider: "antigravity"
  Billing-Api:
    path: "D:/Projects/billing"
    buildCmd: "cargo build"
    testCmd: "cargo test"
    agentProvider: "antigravity"
`;
      const projects = parseProjectsYaml(yaml);
      expect(projects).toHaveLength(2);
      expect(projects[0].alias).toBe('ecommerce');
      expect(projects[1].alias).toBe('billing-api');
    });

    it('throws when YAML string is empty or invalid', () => {
      expect(() => parseProjectsYaml('')).toThrowError(/empty/i);
      expect(() => parseProjectsYaml('   \n  ')).toThrowError(/empty/i);
      expect(() => parseProjectsYaml('invalid: [unclosed')).toThrowError(/YAML/i);
    });
  });

  describe('Project Registry Loader & Normalization (src/core/project-registry.ts)', () => {
    it('registers and retrieves projects case-insensitively', () => {
      const registry = new ProjectRegistry([
        {
          alias: 'ECommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        },
      ]);

      expect(registry.hasProject('ecommerce')).toBe(true);
      expect(registry.hasProject('ECOMMERCE')).toBe(true);
      expect(registry.hasProject('Ecommerce')).toBe(true);
      expect(registry.hasProject('unknown')).toBe(false);
      expect(registry.hasProject('')).toBe(false);

      const projLower = registry.getProject('ecommerce');
      const projUpper = registry.getProject('ECOMMERCE');
      expect(projLower).toBeDefined();
      expect(projUpper).toBeDefined();
      expect(projLower?.alias).toBe('ecommerce');
      expect(projUpper?.alias).toBe('ecommerce');
      expect(projLower?.path).toBe('D:/Projects/ecommerce');
    });

    it('trims whitespace when looking up projects in registry', () => {
      const registry = new ProjectRegistry([
        {
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        },
      ]);

      expect(registry.hasProject('  ecommerce  ')).toBe(true);
      expect(registry.getProject('  ECOMMERCE  ')?.alias).toBe('ecommerce');
    });

    it('preserves existing in-memory projects atomically if loadFromFile fails', () => {
      const registry = new ProjectRegistry([
        {
          alias: 'initial-app',
          path: '/path/init',
          buildCmd: 'make',
          testCmd: 'make test',
          agentProvider: 'antigravity',
        },
      ]);

      const invalidPath = path.join(tempDir, 'invalid.yaml');
      fs.writeFileSync(invalidPath, 'projects: invalid yaml syntax [');

      expect(() => registry.loadFromFile(invalidPath)).toThrow();
      expect(registry.getProjectCount()).toBe(1);
      expect(registry.hasProject('initial-app')).toBe(true);
    });

    it('returns all registered projects and aliases', () => {
      const registry = new ProjectRegistry();
      registry.register({
        alias: 'ProjectA',
        path: '/path/a',
        buildCmd: 'make',
        testCmd: 'make test',
        agentProvider: 'antigravity',
      });
      registry.register({
        alias: 'ProjectB',
        path: '/path/b',
        buildCmd: 'gradle build',
        testCmd: 'gradle test',
        agentProvider: 'antigravity',
      });

      expect(registry.getProjectCount()).toBe(2);
      expect(registry.getProjectAliases()).toEqual(['projecta', 'projectb']);
      expect(registry.getAllProjects()).toHaveLength(2);
    });

    it('throws error when registering duplicate alias (case-insensitively)', () => {
      const registry = new ProjectRegistry();
      registry.register({
        alias: 'ecommerce',
        path: '/path/1',
        buildCmd: 'build',
        testCmd: 'test',
        agentProvider: 'antigravity',
      });

      expect(() =>
        registry.register({
          alias: 'ECOMMERCE',
          path: '/path/2',
          buildCmd: 'build',
          testCmd: 'test',
          agentProvider: 'antigravity',
        })
      ).toThrowError(/Duplicate project alias detected: "ecommerce"/);
    });

    it('loads projects from a valid YAML file', () => {
      const configPath = path.join(tempDir, 'projects.yaml');
      fs.writeFileSync(
        configPath,
        `
projects:
  web-app:
    path: "/home/dev/webapp"
    buildCmd: "npm run build"
    testCmd: "npm test"
    agentProvider: "antigravity"
`
      );

      const registry = new ProjectRegistry();
      registry.loadFromFile(configPath);

      expect(registry.getProjectCount()).toBe(1);
      const project = registry.getProject('web-app');
      expect(project).toBeDefined();
      expect(project?.alias).toBe('web-app');
      expect(project?.path).toBe('/home/dev/webapp');
      expect(project?.buildCmd).toBe('npm run build');
      expect(project?.testCmd).toBe('npm test');
      expect(project?.agentProvider).toBe('antigravity');
    });

    it('throws descriptive error if configuration file is missing', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.yaml');
      const registry = new ProjectRegistry();

      expect(() => registry.loadFromFile(nonExistentPath)).toThrowError(
        /Projects configuration file not found/
      );
    });

    it('throws descriptive error if configuration file fails Zod validation', () => {
      const invalidPath = path.join(tempDir, 'invalid-projects.yaml');
      fs.writeFileSync(
        invalidPath,
        `
projects:
  broken:
    path: "/some/path"
    # missing buildCmd, testCmd, agentProvider
`
      );

      const registry = new ProjectRegistry();
      expect(() => registry.loadFromFile(invalidPath)).toThrowError(
        /Projects configuration validation failed/
      );
    });

    it('resolves config path via PROJECTS_CONFIG_PATH env var when set', () => {
      const customFile = path.join(tempDir, 'custom.yaml');
      fs.writeFileSync(
        customFile,
        `
projects:
  test-proj:
    path: "/test"
    buildCmd: "echo build"
    testCmd: "echo test"
    agentProvider: "antigravity"
`
      );

      const origEnv = process.env.PROJECTS_CONFIG_PATH;
      try {
        process.env.PROJECTS_CONFIG_PATH = customFile;
        const resolved = resolveProjectsConfigPath();
        expect(resolved).toBe(path.resolve(customFile));

        const registry = new ProjectRegistry();
        registry.loadFromFile();
        expect(registry.hasProject('test-proj')).toBe(true);
      } finally {
        if (origEnv !== undefined) {
          process.env.PROJECTS_CONFIG_PATH = origEnv;
        } else {
          delete process.env.PROJECTS_CONFIG_PATH;
        }
      }
    });
  });

  describe('/projects Command Handler & Message Formatting (src/bot/handlers/projects.ts)', () => {
    it('formats a list of registered projects showing alias, path, and provider with next-action hint', () => {
      const projects: ProjectConfig[] = [
        {
          alias: 'ecommerce',
          path: 'D:/Projects/ecommerce',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        },
        {
          alias: 'billing-api',
          path: 'D:/Projects/billing-api',
          buildCmd: 'cargo build',
          testCmd: 'cargo test',
          agentProvider: 'antigravity',
        },
      ];

      const message = formatProjectsMessage(projects);

      expect(message).toContain('Mounted Projects Registry (2)');
      expect(message).toContain('• *ecommerce*');
      expect(message).toContain('Path: `D:/Projects/ecommerce`');
      expect(message).toContain('Provider: `antigravity`');
      expect(message).toContain('• *billing-api*');
      expect(message).toContain('Path: `D:/Projects/billing-api`');
      expect(message).toContain('👉 _Next:_ /build ecommerce or /test ecommerce');
    });

    it('escapes Markdown special characters like underscores in aliases and providers', () => {
      const projects: ProjectConfig[] = [
        {
          alias: 'billing_api_v2',
          path: 'D:/Projects/billing_api',
          buildCmd: 'cargo build',
          testCmd: 'cargo test',
          agentProvider: 'antigravity_cli',
        },
      ];

      const message = formatProjectsMessage(projects);
      expect(message).toContain('*billing\\_api\\_v2*');
      expect(message).toContain('Provider: `antigravity\\_cli`');
      expect(message).toContain('/build billing\\_api\\_v2');
    });

    it('never exposes secret tokens or build/test commands in output message', () => {
      const projects: ProjectConfig[] = [
        {
          alias: 'secure-project',
          path: 'D:/Secret/Path',
          buildCmd: 'SECRET_TOKEN=xyz123 npm run build',
          testCmd: 'SECRET_TOKEN=xyz123 npm test',
          agentProvider: 'antigravity',
          customSecret: 'SUPER_SECRET_123',
        },
      ];

      const message = formatProjectsMessage(projects);
      expect(message).not.toContain('SUPER_SECRET_123');
      expect(message).not.toContain('SECRET_TOKEN=xyz123');
      expect(message).toContain('*secure-project*');
      expect(message).toContain('Path: `D:/Secret/Path`');
      expect(message).toContain('Provider: `antigravity`');
    });

    it('formats empty projects message gracefully', () => {
      const message = formatProjectsMessage([]);
      expect(message).toContain('Mounted Projects Registry (0)');
      expect(message).toContain('No workstation projects are currently configured');
    });

    it('handler sends reply with Markdown parse_mode', async () => {
      const registry = new ProjectRegistry([
        {
          alias: 'my-app',
          path: '/app',
          buildCmd: 'build',
          testCmd: 'test',
          agentProvider: 'antigravity',
        },
      ]);

      const handler = createProjectsHandler(registry);
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        reply: replyMock,
      } as unknown as Context;

      await handler(ctx);

      expect(replyMock).toHaveBeenCalledTimes(1);
      const [replyText, options] = replyMock.mock.calls[0];
      expect(replyText).toContain('*my-app*');
      expect(options).toEqual({ parse_mode: 'Markdown' });
    });
  });

  function createTestBot(
    allowedUserId: number,
    registry?: ProjectRegistry
  ) {
    const bot = createBot(
      '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      new Set([allowedUserId]),
      undefined,
      undefined,
      registry
    );

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

    return bot;
  }

  describe('Bot Integration & Telegram Wire-up (src/bot/bot.ts)', () => {
    it('handles /projects command for authorized user and replies with project list', async () => {
      const allowedUserId = 12345;
      const registry = new ProjectRegistry([
        {
          alias: 'portal',
          path: 'D:/work/portal',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        },
      ]);

      const bot = createTestBot(allowedUserId, registry);

      const replies: Array<{ text: string; options: any }> = [];
      bot.api.config.use((prev, method, payload, signal) => {
        if (method === 'sendMessage') {
          replies.push({
            text: (payload as any).text,
            options: payload,
          });
          return {
            ok: true,
            result: { message_id: 1, date: 1700000000, chat: { id: allowedUserId, type: 'private' } },
          } as any;
        }
        return prev(method, payload, signal);
      });

      await bot.handleUpdate({
        update_id: 100,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: allowedUserId, type: 'private' },
          from: { id: allowedUserId, is_bot: false, first_name: 'Dev' },
          text: '/projects',
          entities: [{ type: 'bot_command', offset: 0, length: 9 }],
        },
      });

      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Mounted Projects Registry (1)');
      expect(replies[0].text).toContain('*portal*');
      expect(replies[0].text).toContain('Path: `D:/work/portal`');
      expect(replies[0].text).toContain('Provider: `antigravity`');
      expect(replies[0].text).toContain('👉 _Next:_ /build portal or /test portal');
      expect(replies[0].options.parse_mode).toBe('Markdown');
    });

    it('silently drops /projects from unauthorized users', async () => {
      const allowedUserId = 12345;
      const unauthorizedUserId = 99999;
      const registry = new ProjectRegistry([
        {
          alias: 'portal',
          path: 'D:/work/portal',
          buildCmd: 'npm run build',
          testCmd: 'npm test',
          agentProvider: 'antigravity',
        },
      ]);

      const bot = createTestBot(allowedUserId, registry);

      const replies: any[] = [];
      bot.api.config.use((prev, method, payload, signal) => {
        if (method === 'sendMessage') {
          replies.push(payload);
          return {
            ok: true,
            result: { message_id: 2, date: 1700000000, chat: { id: unauthorizedUserId, type: 'private' } },
          } as any;
        }
        return prev(method, payload, signal);
      });

      await bot.handleUpdate({
        update_id: 101,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: unauthorizedUserId, type: 'private' },
          from: { id: unauthorizedUserId, is_bot: false, first_name: 'Attacker' },
          text: '/projects',
          entities: [{ type: 'bot_command', offset: 0, length: 9 }],
        },
      });

      expect(replies.length).toBe(0);
    });
  });

  describe('I/O & Edge-Case Matrix Scenarios', () => {
    // Scenario 1: Valid Config on Boot
    it('Matrix Scenario 1: Valid Config on Boot -> Projects parsed, normalized, registered in registry', () => {
      const configFile = path.join(tempDir, 'projects.yaml');
      fs.writeFileSync(
        configFile,
        `
projects:
  ECOMMERCE:
    path: "D:/Projects/ecommerce"
    buildCmd: "npm run build"
    testCmd: "npm test"
    agentProvider: "antigravity"
  BILLING:
    path: "D:/Projects/billing"
    buildCmd: "cargo build"
    testCmd: "cargo test"
    agentProvider: "antigravity"
`
      );

      const registry = new ProjectRegistry();
      registry.loadFromFile(configFile);

      expect(registry.getProjectCount()).toBe(2);
      expect(registry.hasProject('ecommerce')).toBe(true);
      expect(registry.hasProject('billing')).toBe(true);
      const ecommerce = registry.getProject('ecommerce');
      expect(ecommerce?.alias).toBe('ecommerce');
      expect(ecommerce?.path).toBe('D:/Projects/ecommerce');
    });

    // Scenario 2: Invalid Config on Boot
    it('Matrix Scenario 2: Invalid Config on Boot -> Missing mandatory field crashes with descriptive Zod error', () => {
      const configFile = path.join(tempDir, 'projects.yaml');
      fs.writeFileSync(
        configFile,
        `
projects:
  bad-project:
    path: "D:/Projects/bad"
    # missing buildCmd, testCmd, agentProvider
`
      );

      const registry = new ProjectRegistry();
      expect(() => registry.loadFromFile(configFile)).toThrowError(
        /Projects configuration validation failed/
      );
    });

    // Scenario 3: User Sends /projects
    it('Matrix Scenario 3: Authorized user sends /projects -> Lists mounted projects with next hint /build <alias>', async () => {
      const allowedUserId = 777;
      const registry = new ProjectRegistry([
        {
          alias: 'my-service',
          path: '/srv/my-service',
          buildCmd: 'make build',
          testCmd: 'make test',
          agentProvider: 'antigravity',
        },
      ]);

      const bot = createTestBot(allowedUserId, registry);

      let capturedText = '';
      bot.api.config.use((prev, method, payload, signal) => {
        if (method === 'sendMessage') {
          capturedText = (payload as any).text;
          return {
            ok: true,
            result: { message_id: 5, date: 1700000000, chat: { id: allowedUserId, type: 'private' } },
          } as any;
        }
        return prev(method, payload, signal);
      });

      await bot.handleUpdate({
        update_id: 200,
        message: {
          message_id: 5,
          date: Math.floor(Date.now() / 1000),
          chat: { id: allowedUserId, type: 'private' },
          from: { id: allowedUserId, is_bot: false, first_name: 'Dev' },
          text: '/projects',
          entities: [{ type: 'bot_command', offset: 0, length: 9 }],
        },
      });

      expect(capturedText).toContain('*my-service*');
      expect(capturedText).toContain('Path: `/srv/my-service`');
      expect(capturedText).toContain('Provider: `antigravity`');
      expect(capturedText).toContain('👉 _Next:_ /build my-service or /test my-service');
    });
  });
});
