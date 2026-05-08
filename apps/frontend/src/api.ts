// -----------------------------------------------------------------------------
// API client. All three backend service URLs come from Vite env vars so the
// frontend has no hardcoded localhost strings in components.
// -----------------------------------------------------------------------------

const PROFILE_URL =
  import.meta.env.VITE_PROFILE_API_URL || 'http://localhost:3001';
const SHARING_URL =
  import.meta.env.VITE_SHARING_API_URL || 'http://localhost:3002';
const SCORING_URL =
  import.meta.env.VITE_SCORING_API_URL || 'http://localhost:3003';

async function request<T>(
  url: string,
  init: RequestInit & { ownerToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.ownerToken) headers['x-owner-token'] = init.ownerToken;

  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!resp.ok) {
    const message =
      (body && typeof body === 'object' && body.error) ||
      `Request failed: ${resp.status}`;
    throw new Error(message);
  }
  return body as T;
}

// ---- Types --------------------------------------------------------------

export type Category =
  | 'owns'
  | 'wants'
  | 'likes'
  | 'dislikes'
  | 'hobbies'
  | 'style'
  | 'avoid';

export interface CreateProfileInput {
  displayName: string;
  occasion: string;
  budgetMin: number;
  budgetMax: number;
}
export interface CreateProfileResult {
  profileId: string;
  ownerToken: string;
}

export interface Preference {
  id: string;
  category: Category;
  text: string;
  createdAt: string;
}

export interface ProfilePrivate {
  profileId: string;
  displayName: string;
  occasion: string;
  budgetMin: number;
  budgetMax: number;
  createdAt: string;
  preferences: Preference[];
  shareLinks: { shareCode: string; active: boolean; createdAt: string }[];
}

export interface SharePublic {
  valid: boolean;
  occasion?: string;
  budgetMin?: number;
  budgetMax?: number;
}

export interface ScoreInput {
  shareCode: string;
  giverName: string;
  giftName: string;
  giftDescription?: string;
  estimatedPrice?: number;
}

export interface ScoreResult {
  scoreId: string;
  score: number;
  summary: string;
  pros: string[];
  cons: string[];
  confidenceScore: number;
  budgetFit: 'low' | 'good' | 'high' | 'unknown';
}

// ---- Profile service ----------------------------------------------------

export const ProfileApi = {
  create: (input: CreateProfileInput) =>
    request<CreateProfileResult>(`${PROFILE_URL}/api/profiles`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  get: (profileId: string, ownerToken: string) =>
    request<ProfilePrivate>(`${PROFILE_URL}/api/profiles/${profileId}`, {
      method: 'GET',
      ownerToken,
    }),

  addPreference: (
    profileId: string,
    ownerToken: string,
    p: { category: Category; text: string },
  ) =>
    request<Preference>(
      `${PROFILE_URL}/api/profiles/${profileId}/preferences`,
      {
        method: 'POST',
        body: JSON.stringify(p),
        ownerToken,
      },
    ),

  createShareCode: (profileId: string, ownerToken: string) =>
    request<{ shareCode: string }>(
      `${PROFILE_URL}/api/profiles/${profileId}/share-code`,
      { method: 'POST', ownerToken },
    ),
};

// ---- Sharing service ----------------------------------------------------

export const SharingApi = {
  lookup: (shareCode: string) =>
    request<SharePublic>(`${SHARING_URL}/api/share/${shareCode}`),

  submit: (
    shareCode: string,
    submission: {
      giverName: string;
      giftName: string;
      giftDescription?: string;
      estimatedPrice?: number;
    },
  ) =>
    request<{ submissionId: string; createdAt: string }>(
      `${SHARING_URL}/api/share/${shareCode}/submissions`,
      { method: 'POST', body: JSON.stringify(submission) },
    ),
};

// ---- Scoring service ----------------------------------------------------

export const ScoringApi = {
  score: (input: ScoreInput) =>
    request<ScoreResult>(`${SCORING_URL}/api/scores`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
