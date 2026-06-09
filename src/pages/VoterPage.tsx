import { useParams } from 'react-router-dom';
import { usePolls } from '../hooks/usePolls';
import { usePresence } from '../hooks/usePresence';
import { useVote } from '../hooks/useVote';
import { useVoterParticipationStatus } from '../hooks/useVoterParticipationStatus';
import { useVoterSession } from '../hooks/useVoterSession';
import ActivePollCard from '../components/ActivePollCard';
import ClosedPollCard from '../components/ClosedPollCard';
import VoterAuthGate from '../components/VoterAuthGate';

export default function VoterPage() {
  const { sessionId } = useParams();
  const { polls, loading } = usePolls();
  usePresence();
  const { session, loading: sessionLoading, error: sessionError } = useVoterSession(sessionId);
  const { votingFor, error: voteError, handleVote } = useVote();

  const activePoll = polls.find((p) => p.status === 'active');
  const attendanceCompleted = useVoterParticipationStatus(activePoll ?? null, session);
  const closedPolls = polls.filter((p) => p.status === 'closed');
  const requiresAttendance = activePoll?.eligibilityMode === 'attendance';

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
        {session && (
          <p className="text-indigo-100 text-sm mt-1">{session.voterName}님 출석 확인 완료</p>
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {activePoll && requiresAttendance && !session ? (
          <VoterAuthGate loading={sessionLoading} error={sessionError} />
        ) : activePoll ? (
          <ActivePollCard
            poll={activePoll}
            onVote={(poll, choice) => handleVote(poll, choice, session)}
            voting={votingFor === activePoll.id}
            voted={requiresAttendance ? attendanceCompleted : undefined}
            error={voteError}
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
