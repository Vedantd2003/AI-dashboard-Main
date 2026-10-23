import { pino } from 'pino';

export const REDACT_PATHS = [
  'password',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  'token',
  '*.token',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-alphapulse-signature"]',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.api_key',
  '*.webhookUrl',
];

export function createLogger(level: string) {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'alphapulse-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;
