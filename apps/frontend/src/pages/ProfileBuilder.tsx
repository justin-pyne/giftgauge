import { useState } from 'react';
import {
  ProfileApi,
  type Category,
  type CreateProfileResult,
  type Preference,
} from '../api';

const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: 'likes', label: 'Likes', hint: 'Things they enjoy' },
  { id: 'wants', label: 'Wants', hint: 'On their wishlist' },
  { id: 'hobbies', label: 'Hobbies', hint: 'How they spend free time' },
  { id: 'style', label: 'Style', hint: 'Aesthetic preferences' },
  { id: 'owns', label: 'Already owns', hint: 'Avoid duplicates' },
  { id: 'dislikes', label: 'Dislikes', hint: 'Steer clear' },
  { id: 'avoid', label: 'Hard no', hint: 'Strong allergies, ethics, etc.' },
];

export default function ProfileBuilder() {
  const [created, setCreated] = useState<CreateProfileResult | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state for the create-profile step
  const [displayName, setDisplayName] = useState('');
  const [occasion, setOccasion] = useState('Birthday');
  const [budgetMin, setBudgetMin] = useState(25);
  const [budgetMax, setBudgetMax] = useState(100);

  // Form state for adding a preference
  const [category, setCategory] = useState<Category>('likes');
  const [text, setText] = useState('');

  async function handleCreate() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await ProfileApi.create({
        displayName: displayName.trim(),
        occasion: occasion.trim(),
        budgetMin,
        budgetMax,
      });
      setCreated(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddPreference() {
    if (!created || !text.trim()) return;
    setError(null);
    try {
      const pref = await ProfileApi.addPreference(
        created.profileId,
        created.ownerToken,
        { category, text: text.trim() },
      );
      setPreferences((prev) => [...prev, pref]);
      setText('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateShareCode() {
    if (!created) return;
    setError(null);
    try {
      const r = await ProfileApi.createShareCode(
        created.profileId,
        created.ownerToken,
      );
      setShareCode(r.shareCode);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // -----------------------------------------------------------------------
  // Step 1: not yet created
  // -----------------------------------------------------------------------
  if (!created) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <span className="pill">Step 1 of 3</span>
          <h1 className="font-display text-4xl font-semibold mt-4 mb-2">
            Start a profile
          </h1>
          <p className="text-ink/70">
            Tell us who this is for and the budget givers should aim for. Your
            preferences come next.
          </p>
        </div>

        <div className="card p-6 space-y-5">
          <div>
            <label className="label">Display name</label>
            <input
              className="input"
              placeholder="e.g. Justin"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Occasion</label>
            <input
              className="input"
              placeholder="Birthday, Anniversary, Holiday..."
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Budget min ($)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Budget max ($)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
              />
            </div>
          </div>
          {error && (
            <div className="text-sm text-rust bg-rust/5 border border-rust/20 rounded-lg p-3">
              {error}
            </div>
          )}
          <button
            onClick={handleCreate}
            disabled={submitting || !displayName.trim() || !occasion.trim()}
            className="btn-primary w-full py-3"
          >
            {submitting ? 'Creating…' : 'Create profile'}
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Steps 2 & 3: profile exists; add prefs and generate a share code
  // -----------------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <span className="pill">Step 2 of 3</span>
        <h1 className="font-display text-4xl font-semibold mt-4 mb-2">
          Add preferences
        </h1>
        <p className="text-ink/70">
          The more signal you give, the better the scores. Anything you add is
          private — gift givers will never see this list.
        </p>
      </div>

      <div className="card p-5 mb-6 bg-ink text-cream">
        <div className="text-xs uppercase tracking-[0.18em] text-cream/60 mb-2">
          save these — owner token won't be shown again
        </div>
        <div className="space-y-2 font-mono text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-cream/60">profileId</span>
            <span className="break-all">{created.profileId}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-cream/60">ownerToken</span>
            <span className="break-all">{created.ownerToken}</span>
          </div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <div className="grid sm:grid-cols-[180px_1fr_auto] gap-3">
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="vintage cameras, vinyl records, anything cinnamon-flavored…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddPreference();
            }}
          />
          <button
            className="btn-primary"
            onClick={handleAddPreference}
            disabled={!text.trim()}
          >
            Add
          </button>
        </div>

        {preferences.length > 0 && (
          <div className="mt-6 space-y-4">
            {CATEGORIES.map((c) => {
              const items = preferences.filter((p) => p.category === c.id);
              if (items.length === 0) return null;
              return (
                <div key={c.id}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-ash mb-2">
                    {c.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((p) => (
                      <span key={p.id} className="chip">
                        {p.text}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 text-sm text-rust bg-rust/5 border border-rust/20 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <span className="pill">Step 3 of 3</span>
            <h2 className="font-display text-2xl font-semibold mt-3">
              Generate a share code
            </h2>
            <p className="text-sm text-ink/70 mt-1">
              Send this to anyone who wants to score a gift idea for you.
            </p>
          </div>
        </div>
        {!shareCode ? (
          <button
            onClick={handleCreateShareCode}
            className="btn-primary"
            disabled={preferences.length === 0}
          >
            Generate share code
          </button>
        ) : (
          <div className="border border-rust/30 bg-rust/5 rounded-xl p-5 text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-rust mb-2">
              your share code
            </div>
            <div className="font-mono text-3xl font-semibold tracking-widest">
              {shareCode}
            </div>
          </div>
        )}
        {preferences.length === 0 && !shareCode && (
          <p className="text-xs text-ash mt-3">
            Add at least one preference first so the score has something to work with.
          </p>
        )}
      </div>
    </div>
  );
}
