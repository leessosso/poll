import { usePolls } from '../hooks/usePolls';
import { usePresence } from '../hooks/usePresence';
import { useVote } from '../hooks/useVote';
import ActivePollCard from '../components/ActivePollCard';
import ClosedPollCard from '../components/ClosedPollCard';

export default function VoterPage() {
  const { polls, loading } = usePolls();
  usePresence();
  const { votingFor, handleVote } = useVote();

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
        <h1 className="text-lg font-bold">등촌교회 2층년회 투표 시스템</h1>
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
