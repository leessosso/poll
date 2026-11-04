import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { isAdminAccount } from '../lib/admin-auth';
import { auth } from '../lib/firebase';

interface AdminAuthState {
  ready: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

export function useAdminAuth(): AdminAuthState {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setIsAdmin(false);
        setReady(true);
        return;
      }
      void user.getIdTokenResult().then((token) => {
        setIsAdmin(isAdminAccount(user, token.claims));
        setReady(true);
      });
    });
  }, []);

  return {
    ready,
    isAdmin,
    logout: () => signOut(auth),
  };
}
