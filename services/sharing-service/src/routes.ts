import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { pool, pingDb } from './db';
import { logger } from './logger';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpErrorsTotal,
  submissionsTotal,
  shareLookupsTotal,
} from './metrics';

export const router = Router();

// -----------------------------------------------------------------------------
// Per-request observability — same shape as the other services.
// -----------------------------------------------------------------------------
export function observe(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', requestId);
  (req as any).requestId = requestId;

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
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
  res.status(200).json({ status: 'ok' });
});

router.get('/ready', async (_req, res) => {
  const ok = await pingDb();
  if (ok) res.status(200).json({ status: 'ready' });
  else res.status(503).json({ status: 'not-ready', reason: 'db unreachable' });
});

router.get('/metrics', async (_req, res) => {
  res.setHeader('content-type', registry.contentType);
  res.send(await registry.metrics());
});

// -----------------------------------------------------------------------------
// Public share lookup — PRIVACY-CRITICAL.
// Returns ONLY public-safe info: validity, occasion, budgetMin, budgetMax.
// Must never include preferences, displayName, or owner identity.
// -----------------------------------------------------------------------------
router.get('/api/share/:shareCode', async (req, res) => {
  const { shareCode } = req.params;
  const result = await pool.query(
    `SELECT p.occasion, p.budget_min, p.budget_max, sl.active
       FROM share_links sl
       JOIN profiles p ON p.id = sl.profile_id
      WHERE sl.share_code = $1`,
    [shareCode],
  );
  if (result.rowCount === 0 || !result.rows[0].active) {
    shareLookupsTotal.inc({ valid: 'false' });
    return res.status(404).json({ valid: false });
  }
  shareLookupsTotal.inc({ valid: 'true' });
  const r = result.rows[0];
  // Deliberately narrow the projection — no spread, no extra fields.
  res.json({
    valid: true,
    occasion: r.occasion,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
  });
});

/**
 * POST /api/share/:shareCode/submissions
 * Body: { giverName, giftName, giftDescription, estimatedPrice }
 * Stores the submission. Does NOT call the scoring service — the frontend
 * makes that call separately so we keep services decoupled.
 */
router.post('/api/share/:shareCode/submissions', async (req, res) => {
  const { shareCode } = req.params;
  const { giverName, giftName, giftDescription, estimatedPrice } =
    req.body || {};

  if (typeof giverName !== 'string' || !giverName.trim()) {
    return res.status(400).json({ error: 'giverName is required' });
  }
  if (typeof giftName !== 'string' || !giftName.trim()) {
    return res.status(400).json({ error: 'giftName is required' });
  }
  if (
    estimatedPrice !== undefined &&
    estimatedPrice !== null &&
    typeof estimatedPrice !== 'number'
  ) {
    return res.status(400).json({ error: 'estimatedPrice must be a number' });
  }

  // Make sure the share code is real and active before accepting a submission.
  const link = await pool.query(
    `SELECT 1 FROM share_links WHERE share_code = $1 AND active = TRUE`,
    [shareCode],
  );
  if (link.rowCount === 0) {
    return res.status(404).json({ error: 'invalid or inactive share code' });
  }

  const result = await pool.query(
    `INSERT INTO gift_submissions
       (share_code, giver_name, gift_name, gift_description, estimated_price)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [
      shareCode,
      giverName.trim(),
      giftName.trim(),
      typeof giftDescription === 'string' ? giftDescription.trim() : null,
      typeof estimatedPrice === 'number' ? estimatedPrice : null,
    ],
  );
  submissionsTotal.inc();
  res.status(201).json({
    submissionId: result.rows[0].id,
    createdAt: result.rows[0].created_at,
  });
});

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
