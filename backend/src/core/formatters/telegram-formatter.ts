import { sanitizeOutput } from '../security/secret-sanitizer.js';

export const MAX_TELEGRAM_MESSAGE_LENGTH = 3500;
export const DEFAULT_TRUNCATION_NOTICE = '[Output truncated. Full logs retained on workstation.]';

export interface FormatExecutionResultOptions {
  action: 'build' | 'test';
  projectAlias: string;
  exitCode: number | null;
  durationSeconds: number;
  output?: string;
  nextHint?: string;
}

export function formatTaskAcknowledgment(
  action: 'build' | 'test',
  projectAlias: string,
  displayId: string
): string {
  return `⏳ Running ${action} on ${projectAlias} [task: ${displayId}]...`;
}

export function truncateMessage(
  text: string,
  maxLen: number = MAX_TELEGRAM_MESSAGE_LENGTH,
  notice: string = DEFAULT_TRUNCATION_NOTICE
): string {
  if (text.length <= maxLen) {
    return text;
  }

  const noticeSuffix = `\n${notice}`;
  const targetLen = maxLen - noticeSuffix.length;
  if (targetLen <= 0) {
    return text.slice(0, maxLen);
  }

  const candidate = text.slice(0, targetLen);
  const lastNewline = candidate.lastIndexOf('\n');

  if (lastNewline > 0) {
    return `${candidate.slice(0, lastNewline)}${noticeSuffix}`;
  }

  return `${candidate}${noticeSuffix}`;
}

export function formatExecutionResult(options: FormatExecutionResultOptions): string {
  const { action, projectAlias, exitCode, durationSeconds, output, nextHint } = options;
  const isSuccess = exitCode === 0;
  const actionCapitalized = action === 'build' ? 'Build' : 'Test';
  const durationFormatted = `${durationSeconds.toFixed(1)}s`;

  const header = isSuccess
    ? `✅ ${actionCapitalized} succeeded on "${projectAlias}" in ${durationFormatted}`
    : `❌ ${actionCapitalized} failed on "${projectAlias}" (exit ${exitCode ?? 'signal'}) in ${durationFormatted}`;

  const defaultHint = isSuccess
    ? action === 'build'
      ? `👉 Next: /test ${projectAlias}`
      : `👉 Next: /build ${projectAlias}`
    : `👉 Next: /build ${projectAlias} or /projects`;

  const hint = nextHint ?? defaultHint;

  if (isSuccess && (!output || !output.trim())) {
    return `${header}\n\n${hint}`;
  }

  const sanitizedOutput = sanitizeOutput(output || '').trim();

  // If succeeded, we only show output if short; if failed, show diagnostic log
  let message = `${header}\n\n`;
  if (sanitizedOutput) {
    message += `Diagnostics:\n\`\`\`\n${sanitizedOutput}\n\`\`\`\n\n`;
  }
  message += hint;

  if (message.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return message;
  }

  // Bounded formatting: ensure entire message remains under 3,500 chars
  // Reserve space for header, hint, and truncation notice
  const reservedHeaderAndFooter = `${header}\n\nDiagnostics:\n\`\`\`\n\n\`\`\`\n\n${hint}`;
  const availableForOutput = MAX_TELEGRAM_MESSAGE_LENGTH - reservedHeaderAndFooter.length - DEFAULT_TRUNCATION_NOTICE.length - 10;

  let truncatedLog = sanitizedOutput;
  if (availableForOutput > 50 && sanitizedOutput.length > availableForOutput) {
    // Keep trailing log lines (tail) as they contain the actual compiler/test error
    const tailCandidate = sanitizedOutput.slice(-availableForOutput);
    const firstNewline = tailCandidate.indexOf('\n');
    const cleanTail = firstNewline >= 0 ? tailCandidate.slice(firstNewline + 1) : tailCandidate;
    truncatedLog = `${DEFAULT_TRUNCATION_NOTICE}\n${cleanTail}`;
  } else if (availableForOutput <= 50) {
    truncatedLog = DEFAULT_TRUNCATION_NOTICE;
  }

  const boundedMessage = `${header}\n\nDiagnostics:\n\`\`\`\n${truncatedLog}\n\`\`\`\n\n${hint}`;
  return truncateMessage(boundedMessage, MAX_TELEGRAM_MESSAGE_LENGTH);
}
