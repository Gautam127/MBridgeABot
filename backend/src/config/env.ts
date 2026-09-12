import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env into process.env if available
dotenv.config();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string({ error: 'TELEGRAM_BOT_TOKEN is required' })
    .min(1, 'TELEGRAM_BOT_TOKEN is required'),
  ALLOWED_USER_IDS: z
    .string({ error: 'ALLOWED_USER_IDS is required' })
    .min(1, 'ALLOWED_USER_IDS is required')
    .transform((val, ctx) => {
      const parts = val
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

      if (parts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ALLOWED_USER_IDS must contain at least one numeric user ID',
        });
        return new Set<number>();
      }

      const ids = new Set<number>();
      for (const part of parts) {
        const num = Number(part);
        if (!Number.isInteger(num) || num <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid Telegram user ID: "${part}". Must be a positive integer.`,
          });
          return new Set<number>();
        }
        ids.add(num);
      }
      return ids;
    }),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment configuration validation failed:\n${errorMessages}`);
  }
  return result.data;
}

let cachedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
