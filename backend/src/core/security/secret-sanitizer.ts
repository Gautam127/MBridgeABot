export interface SecretSanitizerOptions {
  secrets?: string[];
  includeEnvSecrets?: boolean;
}

export class SecretSanitizer {
  private customSecrets = new Set<string>();

  // Standard token and credential patterns
  private defaultPatterns: Array<{ pattern: RegExp; replacement: string | ((substring: string, ...args: any[]) => string) }> = [
    // Telegram Bot Token: e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz-1234567 or .../bot<token>/...
    {
      pattern: /(?<=\b|bot)\d{6,12}:[A-Za-z0-9_-]{30,45}\b/gi,
      replacement: '[REDACTED]',
    },
    // GitHub Personal Access and Service Tokens: ghp_, gho_, ghu_, ghs_, ghr_
    {
      pattern: /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g,
      replacement: '[REDACTED]',
    },
    // GitHub Fine-grained PATs: github_pat_...
    {
      pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
      replacement: '[REDACTED]',
    },
    // Bearer tokens (e.g. "Bearer eyJhbGciOi...", "Authorization: Bearer <token>")
    {
      pattern: /(Bearer\s+)[A-Za-z0-9_\-\.~+/]+=*/gi,
      replacement: '$1[REDACTED]',
    },
    // AWS Access Key ID
    {
      pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
      replacement: '[REDACTED]',
    },
    // Generic API keys like sk-...
    {
      pattern: /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
      replacement: '[REDACTED]',
    },
    // Private Key blocks (PEM format)
    {
      pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      replacement: '[REDACTED]',
    },
  ];

  constructor(options?: SecretSanitizerOptions) {
    if (options?.secrets) {
      this.registerSecrets(options.secrets);
    }

    if (options?.includeEnvSecrets !== false) {
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.registerSecret(process.env.TELEGRAM_BOT_TOKEN);
      }
    }
  }

  public registerSecret(secret?: string | null): void {
    if (!secret || typeof secret !== 'string') {
      return;
    }
    const trimmed = secret.trim();
    // Guard against redacting empty or tiny substrings (e.g. single letters or common words)
    if (trimmed.length >= 4) {
      this.customSecrets.add(trimmed);
    }
  }

  public registerSecrets(secrets: Array<string | null | undefined>): void {
    for (const secret of secrets) {
      this.registerSecret(secret);
    }
  }

  public removeSecret(secret: string): void {
    if (secret) {
      this.customSecrets.delete(secret.trim());
    }
  }

  public clearSecrets(): void {
    this.customSecrets.clear();
  }

  public getRegisteredSecretsCount(): number {
    return this.customSecrets.size;
  }

  public sanitize(input: unknown): string {
    if (input === null || input === undefined) {
      return '';
    }

    let text: string;
    if (typeof input === 'string') {
      text = input;
    } else if (input instanceof Error) {
      text = `${input.name}: ${input.message}${input.stack ? `\n${input.stack}` : ''}`;
    } else if (typeof input === 'object') {
      try {
        text = JSON.stringify(input);
      } catch {
        text = String(input);
      }
    } else {
      text = String(input);
    }

    if (!text) {
      return '';
    }

    // 1. Scrub registered literal secrets first (longest to shortest to avoid partial redaction)
    const sortedSecrets = Array.from(this.customSecrets).sort((a, b) => b.length - a.length);
    for (const secret of sortedSecrets) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      text = text.replace(regex, '[REDACTED]');
    }

    // 2. Scrub standard token and credential regex patterns
    for (const { pattern, replacement } of this.defaultPatterns) {
      text = text.replace(pattern, replacement as any);
    }

    return text;
  }

  public sanitizeError(err: unknown): Error {
    if (!(err instanceof Error)) {
      return new Error(this.sanitize(String(err)));
    }

    const sanitizedErr = new Error(this.sanitize(err.message));
    sanitizedErr.name = err.name;
    if (err.stack) {
      sanitizedErr.stack = this.sanitize(err.stack);
    }
    return sanitizedErr;
  }

  public sanitizeObject<T>(target: T): T {
    if (target === null || target === undefined) {
      return target;
    }

    if (typeof target === 'string') {
      return this.sanitize(target) as unknown as T;
    }

    if (Array.isArray(target)) {
      return target.map((item) => this.sanitizeObject(item)) as unknown as T;
    }

    if (typeof target === 'object' && !(target instanceof Date) && !(target instanceof RegExp)) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(target)) {
        result[key] = this.sanitizeObject(value);
      }
      return result as T;
    }

    return target;
  }
}

export const defaultSecretSanitizer = new SecretSanitizer();

export function sanitizeOutput(text: string): string {
  return defaultSecretSanitizer.sanitize(text);
}
