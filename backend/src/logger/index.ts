import pino from 'pino';

export function createLogger(level: string = 'info') {
  const isDev = process.env.NODE_ENV === 'development';

  return pino({
    level,
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}

export const logger = createLogger(process.env.LOG_LEVEL || 'info');
