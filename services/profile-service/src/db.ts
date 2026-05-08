import { Pool } from 'pg';
import { logger } from './logger';

if (!process.env.DATABASE_URL) {
  logger.fatal('DATABASE_URL is not set');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep these conservative for a class project; in EKS you'd tune per-replica.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // Don't crash on transient pool errors — log them and let the next request
  // re-establish a healthy connection. Crashing here would defeat liveness.
  logger.error({ err }, 'unexpected error on idle pg client');
});

/**
 * Simple ping used by /ready. We deliberately do a lightweight `SELECT 1`
 * rather than a deeper sanity check so the readiness probe stays cheap and
 * fast under load.
 */
export async function pingDb(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.warn({ err }, 'db ping failed');
    return false;
  }
}
