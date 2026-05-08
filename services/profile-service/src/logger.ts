import pino from 'pino';

const SERVICE_NAME = process.env.SERVICE_NAME || 'profile-service';

/**
 * pino logger emitting JSON to stdout. Fields are ready for Promtail/Loki:
 *   service, level, msg, time, plus per-request fields (requestId, method,
 *   path, statusCode, durationMs) added by the middleware in routes.ts.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: SERVICE_NAME,
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Avoid pino's default `hostname` flooding logs in container envs
  redact: ['req.headers.authorization', 'req.headers["x-owner-token"]'],
});
