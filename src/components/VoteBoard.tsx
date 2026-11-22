import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useBoardLamps } from '../hooks/useBoardLamps';
import { useBoardState } from '../hooks/useBoardState';
import { usePolls } from '../hooks/usePolls';
import { isBoardStandby, setBoardMode } from '../lib/board-state';
import { boardView } from '../lib/board-view';
import BoardEntryQr from './BoardEntryQr';
import VoteBoardView from './VoteBoardView';

interface VoteBoardProps {
  layout?: 'screen' | 'panel';
}

export default function VoteBoard({ layout = 'screen' }: VoteBoardProps) {
  const { polls, loading: pollsLoading } = usePolls('voter', { tallyScope: 'today' });
  const { lamps, loading: lampsLoading, error } = useBoardLamps();
  const { mode, updatedAt } = useBoardState();
  const { ready, isAdmin } = useAdminAuth();
  const [saving, setSaving] = useState(false);
  const [controlError, setControlError] = useState('');
  const loading = pollsLoading || lampsLoading;
  const view = boardView(polls, lamps);
  const standby = isBoardStandby(mode, updatedAt, polls);
  const hasPublishedResults = view.phase === 'closed' && view.poll?.showResults === true;
  const live = view.phase === 'live';

  const changeMode = async (next: 'standby' | 'results') => {
    setSaving(true);
    setControlError('');
    try {
      await setBoardMode(next);
    } catch {
      setControlError('현황판 모드를 바꾸지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const boardControls =
    layout === 'panel' && ready && isAdmin ? (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!live && !standby && (
          <button
            type="button"
            onClick={() => void changeMode('standby')}
            disabled={saving}
            className="px-4 py-2 bg-surface text-primary border border-primary/30 rounded-xl text-sm font-medium hover:bg-primary-soft disabled:opacity-50"
          >
            현황판 준비 화면으로
          </button>
        )}
        {standby && (
          <button
            type="button"
            onClick={() => void changeMode('results')}
            disabled={saving}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {hasPublishedResults ? '결과 다시 보기' : '현황판 다시 보기'}
          </button>
        )}
        {controlError && <p className="w-full text-sm text-red-500">{controlError}</p>}
      </div>
    ) : null;

  return (
    <VoteBoardView
      layout={layout}
      view={view}
      loading={loading}
      error={error}
      standby={standby}
      entryCount={lamps.length}
      showEntryCount={Boolean(ready && isAdmin)}
      boardControls={boardControls}
      headerExtra={
        layout === 'screen' ? (
          <BoardEntryQr />
        ) : (
          <Link to="/board" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary shrink-0">
            크게 보기
          </Link>
        )
      }
    />
  );
}
