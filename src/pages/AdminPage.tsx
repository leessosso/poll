import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { isAdminAccount } from '../lib/admin-auth';
import { emergencyAdminEmail } from '../lib/emergency-admin';
import {
  adminIntro,
  emergencyAdminId,
  emergencyHint,
  orgName,
  shellFailureCopy,
  shellSsoEnabled,
} from '../lib/org-config';
import { auth, db } from '../lib/firebase';
import {
  buildAdminReturnTo,
  buildShellSsoUrl,
  classifyExchangeFailure,
  exchangeShellCode,
  ShellExchangeError,
  takeAdminFragment,
  type ShellLoginFailure,
} from '../lib/shell-admin';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { usePolls } from '../hooks/usePolls';
import type { Poll } from '../types';
import PollAdminCard from '../components/PollAdminCard';
import CreatePollForm from '../components/CreatePollForm';
import PollParticipationPanel from '../components/PollParticipationPanel';
import VoteBoard from '../components/VoteBoard';
import VoterRosterPanel from '../components/VoterRosterPanel';
import { finalizePoll, startPollWithParticipation, togglePollResults } from '../lib/vote-service';
import { useMeetingCheckins } from '../hooks/useMeetingCheckins';
import { useBoardLamps } from '../hooks/useBoardLamps';
import AdminHeadcountBadge from '../components/AdminHeadcountBadge';
import HeadcountPanel, { StartHeadcountDialog } from '../components/HeadcountPanel';

export default function AdminPage() {
  const { ready, isAdmin, logout } = useAdminAuth();
  const [fragment] = useState(() => (shellSsoEnabled ? takeAdminFragment() : { status: 'absent' as const }));
  const [failure, setFailure] = useState<ShellLoginFailure | null>(
    fragment.status === 'malformed' ? 'malformed' : null,
  );
  const [exchanging, setExchanging] = useState(fragment.status === 'ok');

  useEffect(() => {
    if (fragment.status !== 'ok') return;
    let cancelled = false;
    void exchangeShellCode(fragment.code)
      .then(async (firebaseToken) => {
        const credential = await signInWithCustomToken(auth, firebaseToken);
        const token = await credential.user.getIdTokenResult(true);
        if (!isAdminAccount(credential.user, token.claims)) {
          await signOut(auth);
          if (!cancelled) {
            setFailure('forbidden');
            setExchanging(false);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ShellExchangeError) {
          setFailure(classifyExchangeFailure(err.status, err.error));
        } else {
          setFailure('shell-down');
        }
        setExchanging(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fragment]);

  if (ready && isAdmin) return <AdminDashboard onLogout={() => void logout()} />;

  if (exchanging || !ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-gray-400">{exchanging ? `${orgName} 웹 로그인 확인 중...` : '불러오는 중...'}</p>
      </div>
    );
  }

  return <AdminLogin failure={failure} />;
}

function redirectToShell(onBlocked: () => void) {
  const returnTo = buildAdminReturnTo(window.location.origin, import.meta.env.BASE_URL);
  if (!returnTo) {
    onBlocked();
    return;
  }
  window.location.assign(buildShellSsoUrl(returnTo));
}

function AdminLogin({ failure }: { failure: ShellLoginFailure | null }) {
  const [localFailure, setLocalFailure] = useState<ShellLoginFailure | null>(null);
  const shown = localFailure ?? failure;
  const [showEmergency, setShowEmergency] = useState(shown === 'shell-down' || !shellSsoEnabled);
  const copy = shown ? shellFailureCopy[shown] : null;
  const offerRetry = shellSsoEnabled && shown !== 'origin' && shown !== 'shell-down';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">
          {copy ? copy.title : '관리자 로그인'}
        </h1>
        <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed">
          {copy ? copy.body : adminIntro}
        </p>
        {offerRetry && (
          <button
            type="button"
            onClick={() => redirectToShell(() => setLocalFailure('origin'))}
            className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-hover"
          >
            {failure ? `${orgName} 웹으로 다시 로그인` : `${orgName} 웹으로 로그인`}
          </button>
        )}
        {shellSsoEnabled && shown === 'shell-down' && (
          <button
            type="button"
            onClick={() => redirectToShell(() => setLocalFailure('origin'))}
            className="w-full mt-3 border border-border text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50"
          >
            {orgName} 웹이 복구되면 다시 시도
          </button>
        )}
        <div className={offerRetry || (shellSsoEnabled && failure === 'shell-down') ? 'mt-6' : ''}>
          {shellSsoEnabled && (
            <button
              type="button"
              onClick={() => setShowEmergency((open) => !open)}
              className="text-sm text-gray-400 underline"
            >
              {showEmergency ? '비상 로그인 닫기' : '비상 로그인'}
            </button>
          )}
          {showEmergency && <EmergencyLogin />}
        </div>
      </div>
    </div>
  );
}

function EmergencyLogin() {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, emergencyAdminEmail(adminId), password);
      const token = await credential.user.getIdTokenResult(true);
      if (!isAdminAccount(credential.user, token.claims)) {
        await signOut(auth);
        setError('관리자 권한이 없는 계정입니다');
      }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setError('아이디 또는 비밀번호가 틀렸습니다');
      } else if (code === 'auth/operation-not-allowed') {
        setError('이메일 로그인이 꺼져 있습니다. Firebase 콘솔에서 Email/Password 제공자를 켜 주세요.');
      } else {
        setError(err instanceof Error ? err.message : '로그인하지 못했습니다');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4 mt-4">
      <p className="text-gray-400 text-xs leading-relaxed">
        {emergencyHint}
      </p>
      <div>
        <label htmlFor="emergency-admin-id" className="mb-1.5 block text-sm font-medium text-gray-600">
          아이디
        </label>
        <input
          id="emergency-admin-id"
          type="text"
          value={adminId}
          onChange={(e) => { setAdminId(e.target.value); setError(''); }}
          placeholder={emergencyAdminId}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/35"
          required
        />
      </div>
      <input
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(''); }}
        placeholder="비밀번호 입력"
        autoComplete="current-password"
        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/35"
        required
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full border border-primary text-primary py-3 rounded-xl font-semibold hover:bg-primary-soft disabled:opacity-50"
      >
        {submitting ? '확인 중...' : '비상 입장'}
      </button>
    </form>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { polls } = usePolls('admin');
  // 현황판 칸과 참여 현황은 같은 번호 데이터를 한 번만 구독해 나눠 쓴다.
  const boardLamps = useBoardLamps();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const { checkins, loading: checkinsLoading } = useMeetingCheckins(refreshKey);
  const [showCreate, setShowCreate] = useState(false);
  const [openingPoll, setOpeningPoll] = useState<Poll | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!refreshing) return;
    if (!checkinsLoading) {
      setRefreshing(false);
      setUpdatedAt(Date.now());
    }
  }, [refreshing, checkinsLoading]);

  const activePoll = polls.find((p) => p.status === 'active');
  const waitingPolls = polls.filter((p) => p.status === 'waiting');
  const closedPolls = polls.filter((p) => p.status === 'closed');

  const activatePoll = (poll: Poll) => {
    if (activePoll && activePoll.id !== poll.id) {
      alert('먼저 현재 진행 중인 투표를 마감해주세요.');
      return;
    }
    setOpenError('');
    setOpeningPoll(poll);
  };

  const confirmOpen = async (expectedCount: number) => {
    if (!openingPoll) return;
    setOpening(true);
    setOpenError('');
    try {
      await startPollWithParticipation(openingPoll, expectedCount);
      setOpeningPoll(null);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : '투표를 시작하지 못했습니다.');
    } finally {
      setOpening(false);
    }
  };

  const closePoll = (poll: Poll) =>
    finalizePoll(poll);

  const deletePoll = async (poll: Poll) => {
    if (!confirm(`"${poll.title}" 투표를 삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, 'polls', poll.id));
  };

  const toggleResults = (poll: Poll) => togglePollResults(poll);

  const toggleExpanded = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!activePoll?.endsAt) return;
    const id = window.setInterval(() => {
      if (activePoll.status === 'active' && activePoll.endsAt && Date.now() >= activePoll.endsAt) {
        void finalizePoll(activePoll);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [activePoll]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white px-5 py-4 shadow flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">관리자 대시보드</h1>
        <div className="flex items-center gap-3">
          <AdminHeadcountBadge
            checkinCount={checkins.length}
            refreshing={refreshing}
            updatedAt={updatedAt}
            onRefresh={() => {
              setRefreshing(true);
              setRefreshKey((key) => key + 1);
            }}
          />
          <Link to="/board" target="_blank" rel="noreferrer" className="text-sm text-white/80 underline">
            현황판
          </Link>
          <button type="button" onClick={onLogout} className="text-sm text-white/80 underline">
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full bg-primary text-white py-4 rounded-2xl font-semibold text-lg hover:bg-primary-hover shadow-sm"
        >
          + 새 투표 만들기
        </button>

        {activePoll && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              진행 중
            </h2>
            <div className="mb-3">
              <HeadcountPanel
                key={activePoll.id}
                poll={activePoll}
                checkinCount={checkins.length}
              />
            </div>
            <PollAdminCard
              poll={activePoll}
              expanded={expandedId === activePoll.id}
              onToggle={() => toggleExpanded(activePoll.id)}
              onClose={closePoll}
              onDelete={deletePoll}
              onToggleResults={toggleResults}
            />
            <div className="mt-3">
              <PollParticipationPanel poll={activePoll} boardLamps={boardLamps} />
            </div>
          </section>
        )}

        <VoteBoard layout="panel" boardLamps={boardLamps} />

        <VoterRosterPanel eventId={activePoll?.eventId || 'elder-vote'} activePoll={activePoll ?? null} checkins={checkins} />

        {waitingPolls.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              대기 중
            </h2>
            <div className="space-y-3">
              {waitingPolls.map((poll) => (
                <PollAdminCard
                  key={poll.id}
                  poll={poll}
                  expanded={expandedId === poll.id}
                  onToggle={() => toggleExpanded(poll.id)}
                  onActivate={() => activatePoll(poll)}
                  onEdit={() => setEditingPoll(poll)}
                  onDelete={deletePoll}
                  onToggleResults={toggleResults}
                />
              ))}
            </div>
          </section>
        )}

        {closedPolls.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              완료된 투표
            </h2>
            <div className="space-y-3">
              {closedPolls.map((poll) => (
                <PollAdminCard
                  key={poll.id}
                  poll={poll}
                  expanded={expandedId === poll.id}
                  onToggle={() => toggleExpanded(poll.id)}
                  onDelete={deletePoll}
                  onToggleResults={toggleResults}
                />
              ))}
            </div>
          </section>
        )}

        {polls.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>아직 만들어진 투표가 없습니다</p>
          </div>
        )}
      </main>

      {openingPoll && (
        <StartHeadcountDialog
          defaultCount={openingPoll.eligibilityMode === 'roster' ? checkins.length : 0}
          hint={
            openingPoll.eligibilityMode === 'roster' && checkins.length === 0
              ? '이번 모임에 입장한 사람이 없어요. 입장한 뒤에 투표 인원을 정할 수 있어요.'
              : undefined
          }
          submitting={opening}
          error={openError}
          onCancel={() => setOpeningPoll(null)}
          onConfirm={(count) => void confirmOpen(count)}
        />
      )}
      {showCreate && <CreatePollForm onClose={() => setShowCreate(false)} />}
      {editingPoll && (
        <CreatePollForm editPoll={editingPoll} onClose={() => setEditingPoll(null)} />
      )}
    </div>
  );
}
