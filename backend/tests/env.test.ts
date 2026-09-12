import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('Environment Configuration (parseEnv)', () => {
  it('successfully parses valid environment variables', () => {
    const raw = {
      TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      ALLOWED_USER_IDS: '12345678, 87654321',
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
    };

    const config = parseEnv(raw);
    expect(config.TELEGRAM_BOT_TOKEN).toBe(raw.TELEGRAM_BOT_TOKEN);
    expect(config.ALLOWED_USER_IDS.has(12345678)).toBe(true);
    expect(config.ALLOWED_USER_IDS.has(87654321)).toBe(true);
    expect(config.ALLOWED_USER_IDS.size).toBe(2);
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('debug');
  });

  it('throws descriptive error if TELEGRAM_BOT_TOKEN is missing', () => {
    const raw = {
      ALLOWED_USER_IDS: '12345678',
    };

    expect(() => parseEnv(raw)).toThrowError(/TELEGRAM_BOT_TOKEN is required/);
  });

  it('throws descriptive error if ALLOWED_USER_IDS is missing or empty', () => {
    const raw = {
      TELEGRAM_BOT_TOKEN: 'token123',
      ALLOWED_USER_IDS: '',
    };

    expect(() => parseEnv(raw)).toThrowError(/ALLOWED_USER_IDS is required/);
  });

  it('throws descriptive error if an ID is not a valid numeric integer', () => {
    const raw = {
      TELEGRAM_BOT_TOKEN: 'token123',
      ALLOWED_USER_IDS: '12345678,not_a_number,87654321',
    };

    expect(() => parseEnv(raw)).toThrowError(/Invalid Telegram user ID: "not_a_number"/);
  });

  it('throws descriptive error if an ID is negative or zero', () => {
    const raw = {
      TELEGRAM_BOT_TOKEN: 'token123',
      ALLOWED_USER_IDS: '-500',
    };

    expect(() => parseEnv(raw)).toThrowError(/Must be a positive integer/);
  });
});
