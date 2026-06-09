import { useEffect, useState } from 'react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { usePolls } from '../hooks/usePolls';
import { usePresenceStats } from '../hooks/usePresenceStats';
import type { Poll } from '../types';
import PollAdminCard from '../components/PollAdminCard';
import CreatePollForm from '../components/CreatePollForm';
import PollParticipationPanel from '../components/PollParticipationPanel';
import VoterRosterPanel from '../components/VoterRosterPanel';
import { finalizePoll, startPollWithParticipation, togglePollResults } from '../lib/vote-service';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? 'admin1234';

export default function AdminPage() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem('admin_authed') === 'true',
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_authed', 'true');
      setAuthed(true);
    } else {
      setError('비밀번호가 틀렸습니다');
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">관리자 로그인</h1>
          <p className="text-gray-400 text-sm text-center mb-6">등촌교회 2층년회 투표 관리</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="비밀번호 입력"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700"
            >
              입장
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { polls } = usePolls();
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white px-5 py-4 shadow flex items-center justify-between">
        <h1 className="text-lg font-bold">관리자 대시보드</h1>
        <div className="flex items-center gap-2 bg-indigo-700 rounded-full px-3 py-1">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium">
            진입 {visitorCount}명 · 현재 {presenceCount}명
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg hover:bg-indigo-700 shadow-sm"
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

        <VoterRosterPanel eventId={activePoll?.eventId || 'elder-vote'} />

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
