import { signInAnonymously, type User } from 'firebase/auth';
import { auth } from './firebase';

let pending: Promise<User> | null = null;

/** 투표 화면용 익명 로그인. 관리자 세션이 있으면 덮어쓰지 않는다. */
export async function ensureVoterUser(): Promise<User> {
  await auth.authStateReady();
  const current = auth.currentUser;
  if (current?.isAnonymous) return current;
  if (current && !current.isAnonymous) {
    throw new Error('이 브라우저에 관리자 로그인이 남아 있습니다. 관리자 화면에서 로그아웃한 뒤 다시 열어 주세요.');
  }
  if (!pending) {
    pending = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
