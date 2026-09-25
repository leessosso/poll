import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { clearRosterClaim, loadRosterClaim, storeRosterClaim } from '../lib/session-storage';
import type { RosterClaim } from '../types';

interface UseRosterClaimResult {
  claim: RosterClaim | null;
  ready: boolean;
  saveClaim: (claim: RosterClaim) => void;
}

export function useRosterClaim(): UseRosterClaimResult {
  const [claim, setClaim] = useState<RosterClaim | null>(() => loadRosterClaim());
  const [ready, setReady] = useState(() => loadRosterClaim() === null);

  useEffect(() => {
    if (!claim) return;

    const unsub = onSnapshot(doc(db, 'checkins', claim.voterId), (snap) => {
      const token = snap.exists() ? snap.data().claimToken : null;
      if (token !== claim.claimToken) {
        clearRosterClaim();
        setClaim(null);
      }
      setReady(true);
    });

    return unsub;
  }, [claim]);

  const saveClaim = (next: RosterClaim) => {
    storeRosterClaim(next);
    setReady(false);
    setClaim(next);
  };

  return { claim, ready, saveClaim };
}
