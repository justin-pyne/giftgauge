import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { pool, pingDb, isV2Applied } from './db';
import { logger } from './logger';
import { scoreGift, ProfileForScoring, GiftIdea } from './ai';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpErrorsTotal,
} from './metrics';

export const router = Router();

// -----------------------------------------------------------------------------
// Per-request observability
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
// POST /api/scores
//
// PRIVACY-CRITICAL: this endpoint is hit by the gift-giver flow. We accept
// the gift idea and the share code, then look up the recipient's preferences
// IN-PROCESS to call the AI. The response we return contains ONLY the score,
// summary, pros, cons, confidence, and budget fit — never the raw profile.
// -----------------------------------------------------------------------------
router.post('/api/scores', async (req, res) => {
  const {
    shareCode,
    giverName,
    giftName,
    giftDescription,
    estimatedPrice,
  } = req.body || {};

  if (typeof shareCode !== 'string' || !shareCode.trim()) {
    return res.status(400).json({ error: 'shareCode is required' });
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

  // Resolve the share code to a profile + preferences. This is the part
  // that gift-giver-facing services must NEVER expose externally.
  const profileQ = await pool.query(
    `SELECT p.id, p.occasion, p.budget_min, p.budget_max
       FROM share_links sl
       JOIN profiles p ON p.id = sl.profile_id
      WHERE sl.share_code = $1 AND sl.active = TRUE`,
    [shareCode],
  );
  if (profileQ.rowCount === 0) {
    return res.status(404).json({ error: 'invalid or inactive share code' });
  }
  const p = profileQ.rows[0];

  const prefsQ = await pool.query(
    `SELECT category, text FROM preferences WHERE profile_id = $1`,
    [p.id],
  );

  const profile: ProfileForScoring = {
    occasion: p.occasion,
    budgetMin: p.budget_min,
    budgetMax: p.budget_max,
    preferences: prefsQ.rows.map((r) => ({ category: r.category, text: r.text })),
  };
  const gift: GiftIdea = {
    giftName: giftName.trim(),
    giftDescription:
      typeof giftDescription === 'string' ? giftDescription.trim() : null,
    estimatedPrice: typeof estimatedPrice === 'number' ? estimatedPrice : null,
  };

  let result;
  try {
    result = await scoreGift(profile, gift);
  } catch (err) {
    logger.error({ err }, 'scoring failed entirely');
    return res
      .status(502)
      .json({ error: 'scoring failed; please try again later' });
  }

  // Persist. We adapt the INSERT depending on whether V2 is applied so the
  // service keeps working before the migration runs and starts using the
  // new columns automatically once it does.
  const v2 = await isV2Applied();
  let inserted;
  if (v2) {
    inserted = await pool.query(
      `INSERT INTO gift_scores
         (share_code, gift_name, gift_description, estimated_price,
          score, summary, pros, cons, confidence_score, budget_fit)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
       RETURNING id, created_at`,
      [
        shareCode,
        gift.giftName,
        gift.giftDescription,
        gift.estimatedPrice,
        result.score,
        result.summary,
        JSON.stringify(result.pros),
        JSON.stringify(result.cons),
        result.confidenceScore,
        result.budgetFit,
      ],
    );
  } else {
    inserted = await pool.query(
      `INSERT INTO gift_scores
         (share_code, gift_name, gift_description, estimated_price,
          score, summary, pros, cons)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       RETURNING id, created_at`,
      [
        shareCode,
        gift.giftName,
        gift.giftDescription,
        gift.estimatedPrice,
        result.score,
        result.summary,
        JSON.stringify(result.pros),
        JSON.stringify(result.cons),
      ],
    );
  }

  // Note we don't return the giver name in the response body, but log it for
  // observability with the share code so the recipient dashboard can show it.
  logger.info(
    {
      shareCode,
      giverName,
      giftName: gift.giftName,
      score: result.score,
    },
    'gift scored',
  );

  res.status(201).json({
    scoreId: inserted.rows[0].id,
    score: result.score,
    summary: result.summary,
    pros: result.pros,
    cons: result.cons,
    confidenceScore: result.confidenceScore,
    budgetFit: result.budgetFit,
  });
});

/**
 * GET /api/scores/:scoreId — retrieve a previously generated score.
 * Useful for the recipient dashboard to display history.
 */
router.get('/api/scores/:scoreId', async (req, res) => {
  const { scoreId } = req.params;
  const v2 = await isV2Applied();
  const cols = v2
    ? 'id, share_code, gift_name, gift_description, estimated_price, score, summary, pros, cons, confidence_score, budget_fit, created_at'
    : 'id, share_code, gift_name, gift_description, estimated_price, score, summary, pros, cons, created_at';

  const r = await pool.query(
    `SELECT ${cols} FROM gift_scores WHERE id = $1`,
    [scoreId],
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
  const row = r.rows[0];
  res.json({
    scoreId: row.id,
    shareCode: row.share_code,
    giftName: row.gift_name,
    giftDescription: row.gift_description,
    estimatedPrice: row.estimated_price !== null ? Number(row.estimated_price) : null,
    score: row.score,
    summary: row.summary,
    pros: row.pros,
    cons: row.cons,
    confidenceScore: row.confidence_score ?? null,
    budgetFit: row.budget_fit ?? null,
    createdAt: row.created_at,
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
