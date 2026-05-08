import { useState } from 'react';
import { ProfileApi, type ProfilePrivate } from '../api';

export default function Dashboard() {
  const [profileId, setProfileId] = useState('');
  const [ownerToken, setOwnerToken] = useState('');
  const [profile, setProfile] = useState<ProfilePrivate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setError(null);
    setLoading(true);
    try {
      const result = await ProfileApi.get(profileId.trim(), ownerToken.trim());
      setProfile(result);
    } catch (err) {
      setError((err as Error).message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setProfile(null);
    setProfileId('');
    setOwnerToken('');
    setError(null);
  }

  // ---- Sign-in screen ---------------------------------------------------

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="mb-8">
          <span className="pill">Owner only</span>
          <h1 className="font-display text-4xl font-semibold mt-4 mb-2">
            Recipient dashboard
          </h1>
          <p className="text-ink/70">
            Paste the profile ID and owner token you saved when you created
            your profile. Both are required — without the token, the profile
            service returns 401.
          </p>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Profile ID</label>
            <input
              className="input font-mono text-sm"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Owner token</label>
            <input
              className="input font-mono text-sm"
              type="password"
              placeholder="••••••••••••••••••••••••••••••••"
              value={ownerToken}
              onChange={(e) => setOwnerToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLoad();
              }}
            />
          </div>
          {error && (
            <div className="text-sm text-rust bg-rust/5 border border-rust/20 rounded-lg p-3">
              {error}
            </div>
          )}
          <button
            onClick={handleLoad}
            disabled={loading || !profileId.trim() || !ownerToken.trim()}
            className="btn-primary w-full py-3"
          >
            {loading ? 'Loading…' : 'Open dashboard'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Logged-in view ---------------------------------------------------

  // Group preferences by category for display.
  const grouped: Record<string, typeof profile.preferences> = {};
  for (const p of profile.preferences) {
    (grouped[p.category] = grouped[p.category] || []).push(p);
  }
  const orderedCategories = [
    'likes',
    'wants',
    'hobbies',
    'style',
    'owns',
    'dislikes',
    'avoid',
  ].filter((c) => grouped[c]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <span className="pill">private view</span>
          <h1 className="font-display text-4xl font-semibold mt-4 mb-2">
            {profile.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink/70">
            <span>{profile.occasion}</span>
            <span className="text-ash">·</span>
            <span>
              budget ${profile.budgetMin}–${profile.budgetMax}
            </span>
            <span className="text-ash">·</span>
            <span className="font-mono text-xs">
              created {new Date(profile.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-secondary">
          Sign out
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Preferences ---------------------------------------------- */}
        <div className="md:col-span-2 card p-6">
          <h2 className="font-display text-2xl font-semibold mb-5">
            Your preferences
          </h2>
          {orderedCategories.length === 0 ? (
            <p className="text-sm text-ash">
              No preferences yet. Add some in the Build tab — the more signal
              you provide, the better the gift scores will be.
            </p>
          ) : (
            <div className="space-y-5">
              {orderedCategories.map((cat) => (
                <div key={cat}>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ash mb-2">
                    {cat}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {grouped[cat].map((p) => (
                      <span key={p.id} className="chip">
                        {p.text}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Share codes ---------------------------------------------- */}
        <div className="card p-6">
          <h2 className="font-display text-2xl font-semibold mb-5">
            Share codes
          </h2>
          {profile.shareLinks.length === 0 ? (
            <p className="text-sm text-ash">
              You haven't generated any share codes yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {profile.shareLinks.map((sl) => (
                <li
                  key={sl.shareCode}
                  className="border border-line rounded-lg p-3"
                >
                  <div className="font-mono text-sm font-semibold tracking-wider">
                    {sl.shareCode}
                  </div>
                  <div className="text-xs text-ash mt-0.5">
                    {sl.active ? 'active' : 'inactive'} ·{' '}
                    {new Date(sl.createdAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Identity panel ---------------------------------------------- */}
      <div className="card p-6 mt-6 bg-ink text-cream">
        <div className="text-xs uppercase tracking-[0.18em] text-cream/60 mb-3">
          owner credentials — keep these private
        </div>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-cream/60">profileId</span>
            <span className="break-all">{profile.profileId}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-cream/60">ownerToken</span>
            <span className="break-all">{ownerToken}</span>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-ash">
        Note: a future version will surface gift submissions and historical
        scores here. The data is already captured in the database
        (<span className="font-mono">gift_submissions</span>,{' '}
        <span className="font-mono">gift_scores</span>) — adding the dedicated
        owner-only endpoint to expose them is a small, safe next step.
      </p>
    </div>
  );
}
