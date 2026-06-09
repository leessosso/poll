import type { VoterSession } from '../types';

const VOTER_SESSION_KEY = 'church_vote_voter_session';

export function loadStoredVoterSession(): VoterSession | null {
  const raw = sessionStorage.getItem(VOTER_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as VoterSession;
    if (parsed.expiresAt <= Date.now()) {
      clearStoredVoterSession();
      return null;
    }
    return parsed;
  } catch {
    clearStoredVoterSession();
    return null;
  }
}

export function storeVoterSession(session: VoterSession): void {
  sessionStorage.setItem(VOTER_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredVoterSession(): void {
  sessionStorage.removeItem(VOTER_SESSION_KEY);
}
