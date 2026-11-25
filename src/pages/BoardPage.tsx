import { useBoardAccess, useBoardLamps } from '../hooks/useBoardLamps';
import VoteBoard from '../components/VoteBoard';

export default function BoardPage() {
  const { ready, error } = useBoardAccess();

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <p className="text-center text-gray-700">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  return <BoardScreen />;
}

/** 익명 로그인이 끝난 뒤에만 번호를 구독한다. */
function BoardScreen() {
  const boardLamps = useBoardLamps();
  return <VoteBoard layout="screen" boardLamps={boardLamps} />;
}
