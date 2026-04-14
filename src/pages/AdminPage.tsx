import { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import type { Poll } from '../types';
import ResultsBar from '../components/ResultsBar';
import CreatePollForm from '../components/CreatePollForm';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? 'admin1234';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem('admin_authed') === 'true') setAuthed(true);
  }, []);

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
          <p className="text-gray-400 text-sm text-center mb-6">2청년회 총회 투표 관리</p>
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
  const [polls, setPolls] = useState<Poll[]>([]);
  const [presenceCount, setPresenceCount] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPolls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Poll)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const presenceRef = ref(rtdb, 'presence');
    const unsub = onValue(presenceRef, (snap) => {
      setPresenceCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });
    return unsub;
  }, []);

  const activePoll = polls.find((p) => p.status === 'active');

  const activatePoll = async (poll: Poll) => {
    if (activePoll && activePoll.id !== poll.id) {
      alert('먼저 현재 진행 중인 투표를 마감해주세요.');
      return;
    }
    await updateDoc(doc(db, 'polls', poll.id), { status: 'active' });
  };

  const closePoll = (poll: Poll) =>
    updateDoc(doc(db, 'polls', poll.id), { status: 'closed' });

  const deletePoll = async (poll: Poll) => {
    if (!confirm(`"${poll.title}" 투표를 삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, 'polls', poll.id));
  };

  const toggleResults = (poll: Poll) =>
    updateDoc(doc(db, 'polls', poll.id), { showResults: !poll.showResults });

  const waitingPolls = polls.filter((p) => p.status === 'waiting');
  const closedPolls = polls.filter((p) => p.status === 'closed');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white px-5 py-4 shadow flex items-center justify-between">
        <h1 className="text-lg font-bold">관리자 대시보드</h1>
        <div className="flex items-center gap-2 bg-indigo-700 rounded-full px-3 py-1">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium">{presenceCount}명 접속 중</span>
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
              onToggle={() => setExpandedId(expandedId === activePoll.id ? null : activePoll.id)}
              onClose={closePoll}
              onDelete={deletePoll}
              onToggleResults={toggleResults}
            />
          </section>
        )}

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
                  onToggle={() => setExpandedId(expandedId === poll.id ? null : poll.id)}
                  onActivate={() => activatePoll(poll)}
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
                  onToggle={() => setExpandedId(expandedId === poll.id ? null : poll.id)}
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
    </div>
  );
}

interface PollAdminCardProps {
  poll: Poll;
  expanded: boolean;
  onToggle: () => void;
  onActivate?: () => void;
  onClose?: (poll: Poll) => void;
  onDelete: (poll: Poll) => void;
  onToggleResults: (poll: Poll) => void;
}

function PollAdminCard({
  poll,
  expanded,
  onToggle,
  onActivate,
  onClose,
  onDelete,
  onToggleResults,
}: PollAdminCardProps) {
  const statusColor = {
    waiting: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-500',
  }[poll.status];

  const statusLabel = {
    waiting: '대기 중',
    active: '진행 중',
    closed: '완료',
  }[poll.status];

  const total = Object.values(poll.results ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${statusColor}`}>
              {statusLabel}
            </span>
            <p className="text-gray-800 font-semibold truncate">{poll.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {poll.type === 'yesno' ? '찬반' : `${poll.options.length}개 선택지`} · 총 {total}표
            </p>
          </div>
          <span className="text-gray-400 mt-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-50 space-y-4">
          <div className="pt-4">
            <ResultsBar poll={poll} />
          </div>

          <div className="flex flex-wrap gap-2">
            {poll.status === 'waiting' && onActivate && (
              <button
                onClick={onActivate}
                className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600"
              >
                투표 시작
              </button>
            )}
            {poll.status === 'active' && onClose && (
              <button
                onClick={() => onClose(poll)}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
              >
                투표 마감
              </button>
            )}
            {(poll.status === 'active' || poll.status === 'closed') && (
              <button
                onClick={() => onToggleResults(poll)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  poll.showResults
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                {poll.showResults ? '결과 공개 중' : '결과 공개'}
              </button>
            )}
            <button
              onClick={() => onDelete(poll)}
              className="px-4 py-2 bg-white text-red-400 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
