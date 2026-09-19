import { describe, it, expect } from 'vitest';
import {
  SecretSanitizer,
  sanitizeOutput,
} from '../src/core/security/secret-sanitizer.js';

describe('Story 2.2: SecretSanitizer', () => {
  describe('Telegram Bot Token Redaction', () => {
    it('redacts Telegram bot token in standard numeric:alphanumeric format', () => {
      const sanitizer = new SecretSanitizer();
      const output = 'Connecting to Telegram with token 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567...';
      const sanitized = sanitizer.sanitize(output);

      expect(sanitized).toBe('Connecting to Telegram with token [REDACTED]...');
      expect(sanitized).not.toContain('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567');
    });

    it('redacts Telegram bot token embedded in API URLs', () => {
      const sanitizer = new SecretSanitizer();
      const output = 'Request to https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567/sendMessage failed';
      const sanitized = sanitizer.sanitize(output);

      expect(sanitized).toBe('Request to https://api.telegram.org/bot[REDACTED]/sendMessage failed');
    });

    it('redacts process.env.TELEGRAM_BOT_TOKEN when auto-registered', () => {
      const originalEnv = process.env.TELEGRAM_BOT_TOKEN;
      try {
        process.env.TELEGRAM_BOT_TOKEN = '987654321:XYZ-telegram-bot-secret-custom-token';
        const sanitizer = new SecretSanitizer();
        const output = 'Error: 987654321:XYZ-telegram-bot-secret-custom-token invalid!';
        expect(sanitizer.sanitize(output)).toContain('[REDACTED]');
        expect(sanitizer.sanitize(output)).not.toContain('XYZ-telegram-bot-secret-custom-token');
      } finally {
        process.env.TELEGRAM_BOT_TOKEN = originalEnv;
      }
    });
  });

  describe('Standard Token and Credential Patterns', () => {
    it('redacts GitHub Personal Access Tokens (ghp_)', () => {
      const sanitizer = new SecretSanitizer();
      const output = 'git clone https://ghp_abcdef1234567890abcdef123456789012@github.com/repo.git';
      const sanitized = sanitizer.sanitize(output);

      expect(sanitized).toBe('git clone https://[REDACTED]@github.com/repo.git');
      expect(sanitized).not.toContain('ghp_abcdef1234567890abcdef123456789012');
    });

    it('redacts fine-grained GitHub PATs and OAuth tokens (github_pat_, gho_)', () => {
      const sanitizer = new SecretSanitizer();
      const output = 'Tokens: gho_0123456789abcdef0123456789 and github_pat_11AAAAAA0000000000_1234567890abcdef';
      const sanitized = sanitizer.sanitize(output);

      expect(sanitized).toBe('Tokens: [REDACTED] and [REDACTED]');
    });

    it('redacts Bearer tokens while preserving authorization prefix', () => {
      const sanitizer = new SecretSanitizer();
      const header = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID';
      const sanitized = sanitizer.sanitize(header);

      expect(sanitized).toBe('Authorization: Bearer [REDACTED]');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('redacts AWS Access Key IDs', () => {
      const sanitizer = new SecretSanitizer();
      const output = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const sanitized = sanitizer.sanitize(output);

      expect(sanitized).toBe('AWS_ACCESS_KEY_ID=[REDACTED]');
    });

    it('redacts generic sk- API keys', () => {
      const sanitizer = new SecretSanitizer();
      const output = 'API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456';
      const sanitized = sanitizer.sanitize(output);

      expect(sanitized).toBe('API_KEY=[REDACTED]');
    });

    it('redacts PEM private key blocks', () => {
      const sanitizer = new SecretSanitizer();
      const output = `Certificate loaded:
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+
abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----
Ready to serve.`;

      const sanitized = sanitizer.sanitize(output);
      expect(sanitized).toContain('Certificate loaded:\n[REDACTED]\nReady to serve.');
      expect(sanitized).not.toContain('MIIEowIBAAKCAQEA0Y1+');
    });
  });

  describe('Configured Project Secrets', () => {
    it('redacts custom registered secrets', () => {
      const sanitizer = new SecretSanitizer();
      sanitizer.registerSecret('my-database-super-secret-password');
      sanitizer.registerSecret('STRIPE_SECRET_KEY_12345');

      const log = 'Connecting with password=my-database-super-secret-password and STRIPE_SECRET_KEY_12345';
      const sanitized = sanitizer.sanitize(log);

      expect(sanitized).toBe('Connecting with password=[REDACTED] and [REDACTED]');
    });

    it('escapes regex characters when registering literal secrets', () => {
      const sanitizer = new SecretSanitizer();
      sanitizer.registerSecret('p@$$w.r+d(with)[special]*chars');

      const log = 'User logged in with key: p@$$w.r+d(with)[special]*chars in session';
      expect(sanitizer.sanitize(log)).toBe('User logged in with key: [REDACTED] in session');
    });

    it('ignores secrets that are null, empty, or shorter than 4 characters', () => {
      const sanitizer = new SecretSanitizer({ includeEnvSecrets: false });
      sanitizer.registerSecret('abc');
      sanitizer.registerSecret('');
      sanitizer.registerSecret(null);

      expect(sanitizer.getRegisteredSecretsCount()).toBe(0);
      expect(sanitizer.sanitize('abc def')).toBe('abc def');
    });

    it('allows removing and clearing registered secrets', () => {
      const sanitizer = new SecretSanitizer();
      sanitizer.registerSecret('custom-secret-key-1');
      sanitizer.registerSecret('custom-secret-key-2');

      sanitizer.removeSecret('custom-secret-key-1');
      expect(sanitizer.sanitize('custom-secret-key-1 and custom-secret-key-2')).toBe(
        'custom-secret-key-1 and [REDACTED]'
      );

      sanitizer.clearSecrets();
      expect(sanitizer.sanitize('custom-secret-key-2')).toBe('custom-secret-key-2');
    });
  });

  describe('Error, Object, and Non-String Sanitization', () => {
    it('sanitizes Error messages and stack traces', () => {
      const sanitizer = new SecretSanitizer();
      const err = new Error('Failed to connect with token 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567');
      const sanitizedErr = sanitizer.sanitizeError(err);

      expect(sanitizedErr.message).toBe('Failed to connect with token [REDACTED]');
      expect(sanitizedErr.message).not.toContain('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567');
    });

    it('sanitizes nested objects and arrays', () => {
      const sanitizer = new SecretSanitizer();
      const data = {
        command: 'build',
        env: {
          GITHUB_TOKEN: 'ghp_012345678901234567890123456789012345',
          PORT: 3000,
        },
        tags: ['Bearer my-secret-token-value', 'production'],
      };

      const sanitized = sanitizer.sanitizeObject(data);

      expect(sanitized.env.GITHUB_TOKEN).toBe('[REDACTED]');
      expect(sanitized.env.PORT).toBe(3000);
      expect(sanitized.tags[0]).toBe('Bearer [REDACTED]');
      expect(sanitized.tags[1]).toBe('production');
    });

    it('handles null, undefined, numbers, and empty strings safely', () => {
      const sanitizer = new SecretSanitizer();
      expect(sanitizer.sanitize(null)).toBe('');
      expect(sanitizer.sanitize(undefined)).toBe('');
      expect(sanitizer.sanitize(12345)).toBe('12345');
      expect(sanitizer.sanitize('')).toBe('');
    });

    it('sanitizeOutput helper delegates to defaultSecretSanitizer', () => {
      const result = sanitizeOutput('Bearer token-to-redact-123456');
      expect(result).toBe('Bearer [REDACTED]');
    });
  });

  describe('I/O & Edge-Case Matrix Scenarios', () => {
    // Scenario 3: Output Containing Bot Token
    it('Matrix Scenario 3: Output Containing Bot Token -> Token replaced with [REDACTED]', () => {
      const rawProcessOutput = `
[spawn] Command: npm run start
[stdout] Starting daemon with token: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567
[stderr] Warning: ghp_abcdef1234567890abcdef123456789012 used for git fetch
[done] Exit 0
`;

      const sanitized = sanitizeOutput(rawProcessOutput);

      expect(sanitized).toContain('Starting daemon with token: [REDACTED]');
      expect(sanitized).toContain('Warning: [REDACTED] used for git fetch');
      expect(sanitized).not.toContain('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567');
      expect(sanitized).not.toContain('ghp_abcdef1234567890abcdef123456789012');
    });
  });
});
