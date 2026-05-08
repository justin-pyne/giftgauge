import { Pool } from 'pg';
import { logger } from './logger';

if (!process.env.DATABASE_URL) {
  logger.fatal('DATABASE_URL is not set');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected error on idle pg client');
});

export async function pingDb(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.warn({ err }, 'db ping failed');
    return false;
  }
}
