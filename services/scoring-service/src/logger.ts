import pino from 'pino';

const SERVICE_NAME = process.env.SERVICE_NAME || 'scoring-service';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: SERVICE_NAME,
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization'],
});
