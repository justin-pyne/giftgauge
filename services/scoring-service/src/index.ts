import express from 'express';
import { logger } from './logger';
import { pool } from './db';
import { router, observe, errorHandler } from './routes';

const PORT = parseInt(process.env.PORT || '3003', 10);
const HOST = '0.0.0.0';

const app = express();

app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader(
    'access-control-allow-headers',
    'content-type, x-request-id',
  );
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(observe);
app.use(router);
app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
  logger.info(
    { port: PORT, aiMode: process.env.AI_MODE || 'mock' },
    'scoring-service listening',
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(async (err) => {
    if (err) logger.error({ err }, 'error closing http server');
    try {
      await pool.end();
    } catch (err) {
      logger.error({ err }, 'error closing pg pool');
    }
    process.exit(err ? 1 : 0);
  });
  setTimeout(() => {
    logger.warn('forced exit after shutdown timeout');
    process.exit(1);
  }, 25_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception, exiting');
  process.exit(1);
});
