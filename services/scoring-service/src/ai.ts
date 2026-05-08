import { logger } from './logger';
import { aiRequestsTotal, aiRequestDurationSeconds } from './metrics';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ProfileForScoring {
  occasion: string;
  budgetMin: number;
  budgetMax: number;
  preferences: { category: string; text: string }[];
}

export interface GiftIdea {
  giftName: string;
  giftDescription?: string | null;
  estimatedPrice?: number | null;
}

export interface ScoreResult {
  score: number; // 1..10
  summary: string;
  pros: string[];
  cons: string[];
  confidenceScore: number; // 0..100
  budgetFit: 'low' | 'good' | 'high' | 'unknown';
}

// -----------------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------------

export async function scoreGift(
  profile: ProfileForScoring,
  gift: GiftIdea,
): Promise<ScoreResult> {
  const mode = (process.env.AI_MODE || 'mock').toLowerCase();
  const stop = aiRequestDurationSeconds.startTimer({ mode });

  try {
    if (mode === 'openai' && process.env.OPENAI_API_KEY) {
      try {
        const result = await scoreWithOpenAI(profile, gift);
        aiRequestsTotal.inc({ mode: 'openai', outcome: 'success' });
        return result;
      } catch (err) {
        // Live AI failed — log it, then fall back so the service stays useful.
        logger.warn({ err }, 'openai scoring failed; falling back to mock');
        aiRequestsTotal.inc({ mode: 'openai', outcome: 'fallback' });
        return scoreWithMock(profile, gift);
      }
    }

    const result = scoreWithMock(profile, gift);
    aiRequestsTotal.inc({ mode: 'mock', outcome: 'success' });
    return result;
  } catch (err) {
    aiRequestsTotal.inc({ mode, outcome: 'error' });
    throw err;
  } finally {
    stop();
  }
}

// -----------------------------------------------------------------------------
// Mock scoring — deterministic, no external calls.
//
// We score by simple heuristics so the demo is meaningful without any API key:
//   +2  per "likes" or "wants" keyword that appears in name/description
//   +1  per "hobbies" or "style" keyword that appears
//   -3  per "dislikes", "avoid", or "owns" keyword that appears
//   plus a budget-fit modifier
//
// The result is clamped to [1, 10]. This is intentionally simple — it's a
// stand-in so the rest of the system (storage, API, frontend, observability)
// can be built and demoed end-to-end.
// -----------------------------------------------------------------------------

function scoreWithMock(profile: ProfileForScoring, gift: GiftIdea): ScoreResult {
  const haystack = `${gift.giftName} ${gift.giftDescription ?? ''}`.toLowerCase();

  const matches: { category: string; text: string; weight: number }[] = [];
  const POSITIVE = new Set(['likes', 'wants']);
  const SOFT_POSITIVE = new Set(['hobbies', 'style']);
  const NEGATIVE = new Set(['dislikes', 'avoid', 'owns']);

  for (const pref of profile.preferences) {
    const tokens = pref.text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    let hit = false;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;

    if (POSITIVE.has(pref.category)) {
      matches.push({ ...pref, weight: 2 });
    } else if (SOFT_POSITIVE.has(pref.category)) {
      matches.push({ ...pref, weight: 1 });
    } else if (NEGATIVE.has(pref.category)) {
      matches.push({ ...pref, weight: -3 });
    }
  }

  // Budget fit
  const price = gift.estimatedPrice ?? null;
  let budgetFit: ScoreResult['budgetFit'] = 'unknown';
  let budgetModifier = 0;
  if (price !== null) {
    if (price < profile.budgetMin) {
      budgetFit = 'low';
      budgetModifier = -1;
    } else if (price > profile.budgetMax) {
      budgetFit = 'high';
      budgetModifier = -2;
    } else {
      budgetFit = 'good';
      budgetModifier = +1;
    }
  }

  const baseline = 5; // neutral
  const matchScore = matches.reduce((sum, m) => sum + m.weight, 0);
  const raw = baseline + matchScore + budgetModifier;
  const score = Math.max(1, Math.min(10, raw));

  const pros: string[] = [];
  const cons: string[] = [];
  for (const m of matches) {
    const phrase = `Matches their ${m.category} (${m.text})`;
    if (m.weight > 0) pros.push(phrase);
    else cons.push(`Conflicts with their ${m.category} (${m.text})`);
  }
  if (budgetFit === 'good') pros.push('Fits comfortably within the stated budget.');
  if (budgetFit === 'low')
    cons.push(`Comes in below the stated budget (~$${price}).`);
  if (budgetFit === 'high')
    cons.push(`Exceeds the stated budget by $${price! - profile.budgetMax}.`);

  // Make sure we always return something for pros / cons so the UI looks complete.
  if (pros.length === 0)
    pros.push('Reasonable choice for the occasion.');
  if (cons.length === 0)
    cons.push('No specific signal in the recipient profile pushed against this idea.');

  // Confidence is roughly the number of matches we found, capped.
  const confidenceScore = Math.min(
    95,
    40 + matches.length * 12 + (budgetFit !== 'unknown' ? 8 : 0),
  );

  const summary =
    score >= 8
      ? `Strong match for a ${profile.occasion.toLowerCase()} gift — the idea aligns with several signals from the recipient's profile.`
      : score >= 5
        ? `Reasonable ${profile.occasion.toLowerCase()} gift idea with a mix of strengths and gaps.`
        : `Weak fit for this recipient — the idea conflicts with signals from their profile.`;

  return { score, summary, pros, cons, confidenceScore, budgetFit };
}

// -----------------------------------------------------------------------------
// OpenAI scoring — live mode. Uses the global fetch (Node 18+ has it built in).
// On any error this throws, and the caller above falls back to the mock.
// -----------------------------------------------------------------------------

async function scoreWithOpenAI(
  profile: ProfileForScoring,
  gift: GiftIdea,
): Promise<ScoreResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = [
    'You are a thoughtful gift evaluator.',
    'Given a recipient profile and a proposed gift idea, return a JSON object',
    'with fields: score (integer 1-10), summary (string),',
    'pros (string[]), cons (string[]), confidenceScore (integer 0-100),',
    'budgetFit (one of: "low", "good", "high", "unknown").',
    'Return ONLY the JSON object, no prose, no code fences.',
  ].join(' ');

  const userPrompt = JSON.stringify({
    recipient: {
      occasion: profile.occasion,
      budgetMin: profile.budgetMin,
      budgetMax: profile.budgetMax,
      preferences: profile.preferences,
    },
    giftIdea: gift,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`openai responded ${response.status}`);
  }
  const body = (await response.json()) as any;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('openai response missing content');
  }
  const parsed = JSON.parse(content);

  // Validate and coerce the model's output. We don't trust it blindly.
  const score = clampInt(parsed.score, 1, 10);
  const confidenceScore = clampInt(parsed.confidenceScore ?? 70, 0, 100);
  const budgetFit: ScoreResult['budgetFit'] = ['low', 'good', 'high', 'unknown']
    .includes(parsed.budgetFit)
    ? parsed.budgetFit
    : 'unknown';

  return {
    score,
    summary:
      typeof parsed.summary === 'string'
        ? parsed.summary
        : 'AI generated a score but provided no summary.',
    pros: Array.isArray(parsed.pros)
      ? parsed.pros.filter((s: unknown) => typeof s === 'string').slice(0, 8)
      : [],
    cons: Array.isArray(parsed.cons)
      ? parsed.cons.filter((s: unknown) => typeof s === 'string').slice(0, 8)
      : [],
    confidenceScore,
    budgetFit,
  };
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' ? Math.round(v) : NaN;
  if (!Number.isFinite(n)) return Math.round((lo + hi) / 2);
  return Math.max(lo, Math.min(hi, n));
}
