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

/**
 * Detects whether V2 has been applied. Used by the scoring service to decide
 * whether to write confidence_score and budget_fit. This makes the service
 * forward-compatible with both V1-only and V1+V2 schemas, which is what
 * enables the Day 2 schema-change demo: the service can be running before V2
 * is applied, and will start using the new columns automatically once it is.
 */
let v2AppliedCache: boolean | null = null;
let v2LastChecked = 0;
const V2_CACHE_TTL_MS = 60_000;

export async function isV2Applied(): Promise<boolean> {
  const now = Date.now();
  if (v2AppliedCache !== null && now - v2LastChecked < V2_CACHE_TTL_MS) {
    return v2AppliedCache;
  }
  try {
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_name = 'gift_scores'
          AND column_name = 'confidence_score'
        LIMIT 1`,
    );
    v2AppliedCache = (r.rowCount ?? 0) > 0;
    v2LastChecked = now;
    return v2AppliedCache;
  } catch (err) {
    logger.warn({ err }, 'failed to detect V2 schema; assuming not applied');
    return false;
  }
}
