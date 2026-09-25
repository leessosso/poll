import type { RosterClaim, VoterSession } from '../types';

const VOTER_SESSION_KEY = 'church_vote_voter_session';
const ROSTER_CLAIM_KEY = 'church_vote_roster_claim';

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

export function loadRosterClaim(): RosterClaim | null {
  const raw = sessionStorage.getItem(ROSTER_CLAIM_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RosterClaim;
    if (!parsed.voterId || !parsed.claimToken || !parsed.voterName) {
      clearRosterClaim();
      return null;
    }
    return parsed;
  } catch {
    clearRosterClaim();
    return null;
  }
}

export function storeRosterClaim(claim: RosterClaim): void {
  sessionStorage.setItem(ROSTER_CLAIM_KEY, JSON.stringify(claim));
}

export function clearRosterClaim(): void {
  sessionStorage.removeItem(ROSTER_CLAIM_KEY);
}
