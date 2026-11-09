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

// 입장 정보는 탭을 닫아도 남도록 localStorage 에 둔다.
// 예전 버전이 sessionStorage 에 둔 값은 한 번 옮겨 온다.
export function loadRosterClaim(): RosterClaim | null {
  const legacy = sessionStorage.getItem(ROSTER_CLAIM_KEY);
  if (legacy && !localStorage.getItem(ROSTER_CLAIM_KEY)) localStorage.setItem(ROSTER_CLAIM_KEY, legacy);
  if (legacy) sessionStorage.removeItem(ROSTER_CLAIM_KEY);
  const raw = localStorage.getItem(ROSTER_CLAIM_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RosterClaim;
    if (!parsed.meetingId || !parsed.voterId || !parsed.claimToken || !parsed.voterName) {
      clearRosterClaim();
      return null;
    }
    if (parsed.badge != null && (!Number.isInteger(parsed.badge) || parsed.badge < 1)) {
      delete parsed.badge;
    }
    return parsed;
  } catch {
    clearRosterClaim();
    return null;
  }
}

export function storeRosterClaim(claim: RosterClaim): void {
  localStorage.setItem(ROSTER_CLAIM_KEY, JSON.stringify(claim));
}

export function clearRosterClaim(): void {
  localStorage.removeItem(ROSTER_CLAIM_KEY);
  sessionStorage.removeItem(ROSTER_CLAIM_KEY);
}
