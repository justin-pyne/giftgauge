import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import { pool, pingDb } from './db';
import { logger } from './logger';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpErrorsTotal,
  profilesCreatedTotal,
} from './metrics';

export const router = Router();

const ALLOWED_CATEGORIES = new Set([
  'owns',
  'wants',
  'likes',
  'dislikes',
  'hobbies',
  'style',
  'avoid',
]);

// -----------------------------------------------------------------------------
// Per-request observability middleware.
// Attaches a requestId, logs structured access lines, and records metrics.
// We attach this in index.ts at the app level rather than the router level so
// that /health, /ready, /metrics also benefit from access logs and metrics.
// -----------------------------------------------------------------------------
export function observe(req: Request, res: Response, next: NextFunction) {
  const requestId =
    (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', requestId);
  (req as any).requestId = requestId;

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = durationNs / 1_000_000;
    const route = (req.route?.path && req.baseUrl + req.route.path) || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationMs / 1000);
    if (res.statusCode >= 500) {
      httpErrorsTotal.inc({ method: req.method, route });
    }
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request',
    );
  });

  next();
}

// -----------------------------------------------------------------------------
// Health / readiness / metrics
// -----------------------------------------------------------------------------

router.get('/health', (_req, res) => {
  // Liveness only: don't touch the DB. If the process is up, we're alive.
  res.status(200).json({ status: 'ok' });
});

router.get('/ready', async (_req, res) => {
  const ok = await pingDb();
  if (ok) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not-ready', reason: 'db unreachable' });
  }
});

router.get('/metrics', async (_req, res) => {
  res.setHeader('content-type', registry.contentType);
  res.send(await registry.metrics());
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function generateOwnerToken(): string {
  // 32 hex chars = 128 bits of entropy. Plenty for a class project.
  return randomBytes(16).toString('hex');
}

function generateShareCode(): string {
  // GIFT-XXXXXX where X is uppercase alphanumeric (excluding ambiguous chars).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let body = '';
  const buf = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    body += alphabet[buf[i] % alphabet.length];
  }
  return `GIFT-${body}`;
}

/**
 * Verifies the x-owner-token header matches the profile. Returns true if OK,
 * false otherwise (and writes the 401/404 response itself).
 */
async function checkOwnerToken(
  profileId: string,
  req: Request,
  res: Response,
): Promise<boolean> {
  const token = req.header('x-owner-token');
  if (!token) {
    res.status(401).json({ error: 'missing x-owner-token header' });
    return false;
  }
  const result = await pool.query(
    'SELECT owner_token FROM profiles WHERE id = $1',
    [profileId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'profile not found' });
    return false;
  }
  if (result.rows[0].owner_token !== token) {
    res.status(401).json({ error: 'invalid owner token' });
    return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

/**
 * POST /api/profiles
 * Body: { displayName, occasion, budgetMin, budgetMax }
 * Returns: { profileId, ownerToken }
 */
router.post('/api/profiles', async (req, res) => {
  const { displayName, occasion, budgetMin, budgetMax } = req.body || {};
  if (
    typeof displayName !== 'string' ||
    typeof occasion !== 'string' ||
    typeof budgetMin !== 'number' ||
    typeof budgetMax !== 'number'
  ) {
    return res.status(400).json({
      error:
        'displayName (string), occasion (string), budgetMin (number), budgetMax (number) are required',
    });
  }
  if (budgetMin < 0 || budgetMax < budgetMin) {
    return res
      .status(400)
      .json({ error: 'budgetMin must be >= 0 and budgetMax must be >= budgetMin' });
  }

  const ownerToken = generateOwnerToken();
  const result = await pool.query(
    `INSERT INTO profiles (display_name, occasion, budget_min, budget_max, owner_token)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [displayName, occasion, budgetMin, budgetMax, ownerToken],
  );
  profilesCreatedTotal.inc();
  res.status(201).json({
    profileId: result.rows[0].id,
    ownerToken,
  });
});

/**
 * GET /api/profiles/:profileId
 * Owner-only: returns the full private profile including all preferences.
 */
router.get('/api/profiles/:profileId', async (req, res) => {
  const { profileId } = req.params;
  if (!(await checkOwnerToken(profileId, req, res))) return;

  const profile = await pool.query(
    `SELECT id, display_name, occasion, budget_min, budget_max, created_at
       FROM profiles WHERE id = $1`,
    [profileId],
  );
  const preferences = await pool.query(
    `SELECT id, category, text, created_at
       FROM preferences WHERE profile_id = $1 ORDER BY created_at ASC`,
    [profileId],
  );
  const shareLinks = await pool.query(
    `SELECT share_code, active, created_at
       FROM share_links WHERE profile_id = $1 ORDER BY created_at ASC`,
    [profileId],
  );

  const p = profile.rows[0];
  res.json({
    profileId: p.id,
    displayName: p.display_name,
    occasion: p.occasion,
    budgetMin: p.budget_min,
    budgetMax: p.budget_max,
    createdAt: p.created_at,
    preferences: preferences.rows.map((r) => ({
      id: r.id,
      category: r.category,
      text: r.text,
      createdAt: r.created_at,
    })),
    shareLinks: shareLinks.rows.map((r) => ({
      shareCode: r.share_code,
      active: r.active,
      createdAt: r.created_at,
    })),
  });
});

/**
 * POST /api/profiles/:profileId/preferences
 * Owner-only. Body: { category, text }
 */
router.post('/api/profiles/:profileId/preferences', async (req, res) => {
  const { profileId } = req.params;
  if (!(await checkOwnerToken(profileId, req, res))) return;

  const { category, text } = req.body || {};
  if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category)) {
    return res.status(400).json({
      error: `category must be one of: ${[...ALLOWED_CATEGORIES].join(', ')}`,
    });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const result = await pool.query(
    `INSERT INTO preferences (profile_id, category, text)
     VALUES ($1, $2, $3)
     RETURNING id, category, text, created_at`,
    [profileId, category, text.trim()],
  );
  const r = result.rows[0];
  res.status(201).json({
    id: r.id,
    category: r.category,
    text: r.text,
    createdAt: r.created_at,
  });
});

/**
 * POST /api/profiles/:profileId/share-code
 * Owner-only. Creates a new share code for the profile.
 */
router.post('/api/profiles/:profileId/share-code', async (req, res) => {
  const { profileId } = req.params;
  if (!(await checkOwnerToken(profileId, req, res))) return;

  // In the rare case of a collision, retry a few times. With 32^6 = ~1B codes
  // collision is astronomically unlikely, but this keeps the code defensive.
  for (let attempt = 0; attempt < 5; attempt++) {
    const shareCode = generateShareCode();
    try {
      await pool.query(
        `INSERT INTO share_links (profile_id, share_code) VALUES ($1, $2)`,
        [profileId, shareCode],
      );
      return res.status(201).json({ shareCode });
    } catch (err: any) {
      if (err?.code === '23505') {
        // unique_violation — try again
        continue;
      }
      throw err;
    }
  }
  res.status(500).json({ error: 'could not generate a unique share code' });
});

// Catch-all error handler (last middleware).
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  logger.error(
    { err, requestId: (req as any).requestId, path: req.originalUrl },
    'unhandled error',
  );
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal server error' });
}
