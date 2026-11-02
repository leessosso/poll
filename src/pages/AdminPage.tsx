import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { isAdminAccount } from '../lib/admin-auth';
import { auth, db } from '../lib/firebase';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { usePolls } from '../hooks/usePolls';
import { usePresenceStats } from '../hooks/usePresenceStats';
import type { Poll } from '../types';
import PollAdminCard from '../components/PollAdminCard';
import CreatePollForm from '../components/CreatePollForm';
import PollParticipationPanel from '../components/PollParticipationPanel';
import VoterRosterPanel from '../components/VoterRosterPanel';
import { finalizePoll, startPollWithParticipation, togglePollResults } from '../lib/vote-service';

export default function AdminPage() {
  const { ready, isAdmin, logout } = useAdminAuth();

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  if (!isAdmin) return <AdminLogin />;
  return <AdminDashboard onLogout={() => void logout()} />;
}

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await credential.user.getIdTokenResult(true);
      if (!isAdminAccount(credential.user, token.claims)) {
        await signOut(auth);
        setError('관리자 권한이 없는 계정입니다');
      }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setError('이메일 또는 비밀번호가 틀렸습니다');
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">관리자 로그인</h1>
        <p className="text-gray-400 text-sm text-center mb-6">등촌교회 2층년회 투표 관리</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="이메일"
            autoComplete="username"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/35"
            autoFocus
            required
          />
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
            className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { polls } = usePolls('admin');
  const { presenceCount, visitorCount } = usePresenceStats();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activePoll = polls.find((p) => p.status === 'active');
  const waitingPolls = polls.filter((p) => p.status === 'waiting');
  const closedPolls = polls.filter((p) => p.status === 'closed');

  const activatePoll = async (poll: Poll) => {
    if (activePoll && activePoll.id !== poll.id) {
      alert('먼저 현재 진행 중인 투표를 마감해주세요.');
      return;
    }
    await startPollWithParticipation(poll);
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
      <header className="bg-primary text-white px-5 py-4 shadow flex items-center justify-between">
        <h1 className="text-lg font-bold">관리자 대시보드</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              진입 {visitorCount}명 · 현재 {presenceCount}명
            </span>
          </div>
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
            <PollAdminCard
              poll={activePoll}
              expanded={expandedId === activePoll.id}
              onToggle={() => toggleExpanded(activePoll.id)}
              onClose={closePoll}
              onDelete={deletePoll}
              onToggleResults={toggleResults}
            />
            <div className="mt-3">
              <PollParticipationPanel poll={activePoll} />
            </div>
          </section>
        )}

        <VoterRosterPanel eventId={activePoll?.eventId || 'elder-vote'} activePoll={activePoll ?? null} />

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

      {showCreate && <CreatePollForm onClose={() => setShowCreate(false)} />}
      {editingPoll && (
        <CreatePollForm editPoll={editingPoll} onClose={() => setEditingPoll(null)} />
      )}
    </div>
  );
}
