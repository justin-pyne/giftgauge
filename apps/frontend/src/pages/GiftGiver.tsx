import { useState } from 'react';
import {
  SharingApi,
  ScoringApi,
  type SharePublic,
  type ScoreResult,
} from '../api';

export default function GiftGiver() {
  const [shareCode, setShareCode] = useState('');
  const [share, setShare] = useState<SharePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [loadingScore, setLoadingScore] = useState(false);
  const [score, setScore] = useState<ScoreResult | null>(null);

  // Submission form state
  const [giverName, setGiverName] = useState('');
  const [giftName, setGiftName] = useState('');
  const [giftDescription, setGiftDescription] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState<number | ''>('');

  async function handleLookup() {
    setError(null);
    setShare(null);
    setScore(null);
    setLoadingLookup(true);
    try {
      const result = await SharingApi.lookup(shareCode.trim().toUpperCase());
      setShare(result);
    } catch (err) {
      setError((err as Error).message);
      setShare({ valid: false });
    } finally {
      setLoadingLookup(false);
    }
  }

  async function handleScore() {
    setError(null);
    setLoadingScore(true);
    try {
      // 1. Submit to sharing-service to record the submission.
      await SharingApi.submit(shareCode.trim().toUpperCase(), {
        giverName: giverName.trim(),
        giftName: giftName.trim(),
        giftDescription: giftDescription.trim() || undefined,
        estimatedPrice: typeof estimatedPrice === 'number' ? estimatedPrice : undefined,
      });
      // 2. Then ask scoring-service to score it.
      const result = await ScoringApi.score({
        shareCode: shareCode.trim().toUpperCase(),
        giverName: giverName.trim(),
        giftName: giftName.trim(),
        giftDescription: giftDescription.trim() || undefined,
        estimatedPrice: typeof estimatedPrice === 'number' ? estimatedPrice : undefined,
      });
      setScore(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingScore(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <span className="pill">Gift giver</span>
        <h1 className="font-display text-4xl font-semibold mt-4 mb-2">
          Score a gift idea
        </h1>
        <p className="text-ink/70">
          Enter the share code you were given. You'll see only the occasion and
          budget — never the recipient's preferences.
        </p>
      </div>

      <div className="card p-6 mb-6">
        <label className="label">Share code</label>
        <div className="flex gap-3">
          <input
            className="input font-mono uppercase tracking-widest"
            placeholder="GIFT-ABC123"
            value={shareCode}
            onChange={(e) => setShareCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLookup();
            }}
          />
          <button
            onClick={handleLookup}
            disabled={!shareCode.trim() || loadingLookup}
            className="btn-primary"
          >
            {loadingLookup ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        {error && !share && (
          <div className="mt-3 text-sm text-rust">{error}</div>
        )}
        {share && !share.valid && (
          <div className="mt-3 text-sm text-rust">
            That share code isn't valid or has been deactivated.
          </div>
        )}
      </div>

      {share?.valid && (
        <>
          <div className="card p-6 mb-6">
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="pill">occasion</span>
              <span className="text-base font-semibold">{share.occasion}</span>
              <span className="text-ash">·</span>
              <span className="pill">budget</span>
              <span className="text-base font-semibold">
                ${share.budgetMin}–${share.budgetMax}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Your name</label>
                <input
                  className="input"
                  placeholder="Alex"
                  value={giverName}
                  onChange={(e) => setGiverName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Estimated price ($)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="80"
                  value={estimatedPrice}
                  onChange={(e) =>
                    setEstimatedPrice(
                      e.target.value === '' ? '' : Number(e.target.value),
                    )
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Gift idea</label>
                <input
                  className="input"
                  placeholder="Bluetooth record player"
                  value={giftName}
                  onChange={(e) => setGiftName(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description (optional)</label>
                <textarea
                  className="input min-h-[88px]"
                  placeholder="Portable record player with built-in speakers"
                  value={giftDescription}
                  onChange={(e) => setGiftDescription(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn-primary mt-5 w-full py-3"
              onClick={handleScore}
              disabled={
                loadingScore ||
                !giverName.trim() ||
                !giftName.trim()
              }
            >
              {loadingScore ? 'Scoring…' : 'Get the score →'}
            </button>
            {error && score === null && (
              <div className="mt-3 text-sm text-rust">{error}</div>
            )}
          </div>

          {score && <ScoreCard result={score} />}
        </>
      )}
    </div>
  );
}

function ScoreCard({ result }: { result: ScoreResult }) {
  const tone =
    result.score >= 8
      ? 'text-moss border-moss/30 bg-moss/5'
      : result.score >= 5
        ? 'text-ink border-line bg-white'
        : 'text-rust border-rust/30 bg-rust/5';

  return (
    <div className={`rounded-2xl border p-6 ${tone}`}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-display text-6xl font-semibold leading-none">
          {result.score}
        </span>
        <span className="text-ash text-sm">/ 10</span>
        <span className="ml-auto text-xs uppercase tracking-[0.18em] text-ash">
          confidence {result.confidenceScore}% · budget {result.budgetFit}
        </span>
      </div>
      <p className="text-base leading-relaxed mb-5">{result.summary}</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-moss mb-2">
            Pros
          </div>
          <ul className="space-y-1.5 text-sm">
            {result.pros.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-moss">+</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-rust mb-2">
            Cons
          </div>
          <ul className="space-y-1.5 text-sm">
            {result.cons.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-rust">−</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
