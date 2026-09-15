import type { Context } from 'grammy';
import {
  getSystemTelemetry,
  formatTelemetryMessage,
  type TelemetryCollectorOptions,
} from '../../core/telemetry.js';

export function createStatusHandler(options?: TelemetryCollectorOptions) {
  return async (ctx: Context): Promise<void> => {
    const telemetry = getSystemTelemetry(options);
    const message = formatTelemetryMessage(telemetry);
    await ctx.reply(message, { parse_mode: 'Markdown' });
  };
}
