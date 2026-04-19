import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, runTransaction as runFirestoreTransaction } from 'firebase/firestore';
import {
  ref,
  onDisconnect,
  remove,
  runTransaction as runRtdbTransaction,
  update,
  onValue,
  set,
} from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import type { Poll } from '../types';
import ResultsBar from '../components/ResultsBar';

function getOptions(poll: Poll): string[] {
  if (poll.type === 'yesno') return ['찬성', '반대'];
  return poll.options;
}

function hasVoted(pollId: string): boolean {
  return localStorage.getItem(`voted_${pollId}`) === 'true';
}

function markVoted(pollId: string) {
  localStorage.setItem(`voted_${pollId}`, 'true');
}

function getClientId(): string {
  const storageKey = 'church_vote_client_id';
  const existingId = localStorage.getItem(storageKey);
  if (existingId) return existingId;

  const generatedId = `client_${crypto.randomUUID()}`;
  localStorage.setItem(storageKey, generatedId);
  return generatedId;
}

function getSessionId(): string {
  const storageKey = 'church_vote_session_id';
  const existingId = sessionStorage.getItem(storageKey);
  if (existingId) return existingId;

  const generatedId = `session_${crypto.randomUUID()}`;
  sessionStorage.setItem(storageKey, generatedId);
  return generatedId;
}

export default function VoterPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingFor, setVotingFor] = useState<string | null>(null);

  useEffect(() => {
    const now = Date.now();
    const clientId = getClientId();
    const sessionId = getSessionId();
    const visitorRef = ref(rtdb, `visitors/${clientId}`);
    const presenceRef = ref(rtdb, `presence/${sessionId}`);
    const connectedRef = ref(rtdb, '.info/connected');

    void runRtdbTransaction(visitorRef, (current) => {
      if (current) {
        return {
          ...current,
          lastSeenAt: now,
          visitCount: (current.visitCount ?? 0) + 1,
        };
      }

      return {
        firstSeenAt: now,
        lastSeenAt: now,
        visitCount: 1,
      };
    });

    const registerPresence = async () => {
      try {
        await onDisconnect(presenceRef).remove();
        await set(presenceRef, {
          clientId,
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        });
      } catch (err) {
        console.error('presence registration failed', err);
      }
    };

    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;
      void registerPresence();
    });

    const touchVisitor = () => {
      const ts = Date.now();
      void update(visitorRef, { lastSeenAt: ts });
      void update(presenceRef, { lastSeenAt: ts });
    };
    const visibilityHandler = () => touchVisitor();
    const intervalId = window.setInterval(touchVisitor, 30000);
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      unsubConnected();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', visibilityHandler);
      touchVisitor();
      void remove(presenceRef);
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Poll));
      setPolls(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleVote = async (poll: Poll, choice: string) => {
    if (hasVoted(poll.id) || votingFor) return;
    setVotingFor(poll.id);
    try {
      const pollRef = doc(db, 'polls', poll.id);
      await runFirestoreTransaction(db, async (tx) => {
        const snap = await tx.get(pollRef);
        if (!snap.exists()) return;
        const current = snap.data().results ?? {};
        tx.update(pollRef, {
          [`results.${choice}`]: (current[choice] ?? 0) + 1,
        });
      });
      markVoted(poll.id);
    } catch (err) {
      console.error(err);
    } finally {
      setVotingFor(null);
    }
  };

  const activePoll = polls.find((p) => p.status === 'active');
  const closedPolls = polls.filter((p) => p.status === 'closed');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-lg">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white px-5 py-4 shadow">
        <h1 className="text-lg font-bold">2청년회 총회 투표</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {activePoll ? (
          <ActivePollCard
            poll={activePoll}
            onVote={handleVote}
            voting={votingFor === activePoll.id}
          />
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-gray-500 font-medium">다음 투표를 기다려주세요</p>
            <p className="text-gray-400 text-sm mt-1">관리자가 투표를 열면 바로 나타납니다</p>
          </div>
        )}

        {closedPolls.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              완료된 투표
            </h2>
            <div className="space-y-4">
              {closedPolls.map((poll) => (
                <ClosedPollCard key={poll.id} poll={poll} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ActivePollCard({
  poll,
  onVote,
  voting,
}: {
  poll: Poll;
  onVote: (poll: Poll, choice: string) => void;
  voting: boolean;
}) {
  const voted = hasVoted(poll.id);
  const options = getOptions(poll);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
      <div className="bg-indigo-600 px-5 py-3 flex items-center gap-2">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <span className="text-white text-sm font-medium">진행 중</span>
      </div>
      <div className="p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-5">{poll.title}</h2>

        {voted ? (
          <div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium mb-4">
              ✓ 투표 완료
            </div>
            {poll.showResults && <ResultsBar poll={poll} />}
            {!poll.showResults && (
              <p className="text-center text-sm text-gray-400">결과는 투표 종료 후 공개됩니다</p>
            )}
          </div>
        ) : (
          <div className={`grid gap-3 ${poll.type === 'yesno' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {options.map((option) => {
              const isYes = option === '찬성';
              const btnColor =
                poll.type === 'yesno'
                  ? isYes
                    ? 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700'
                    : 'bg-red-400 hover:bg-red-500 active:bg-red-600'
                  : 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700';

              return (
                <button
                  key={option}
                  onClick={() => onVote(poll, option)}
                  disabled={voting}
                  className={`${btnColor} text-white font-semibold py-5 rounded-xl text-lg transition-all active:scale-95 disabled:opacity-50 shadow-sm`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ClosedPollCard({ poll }: { poll: Poll }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <span className="text-xs text-gray-400 font-medium">완료</span>
          <p className="text-gray-700 font-medium">{poll.title}</p>
        </div>
        <span className="text-gray-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-50">
          <div className="pt-4">
            <ResultsBar poll={poll} />
          </div>
        </div>
      )}
    </div>
  );
}
