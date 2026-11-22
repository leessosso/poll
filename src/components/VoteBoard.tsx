import { Link } from 'react-router-dom';
import { useBoardLamps } from '../hooks/useBoardLamps';
import { usePolls } from '../hooks/usePolls';
import { boardView } from '../lib/board-view';
import BoardEntryQr from './BoardEntryQr';
import VoteBoardView from './VoteBoardView';

interface VoteBoardProps {
  layout?: 'screen' | 'panel';
}

export default function VoteBoard({ layout = 'screen' }: VoteBoardProps) {
  const { polls, loading: pollsLoading } = usePolls('voter', { tallyScope: 'today' });
  const { lamps, loading: lampsLoading, error } = useBoardLamps();
  const loading = pollsLoading || lampsLoading;

  return (
    <VoteBoardView
      layout={layout}
      view={boardView(polls, lamps)}
      loading={loading}
      error={error}
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
