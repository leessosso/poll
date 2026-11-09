import { Link } from 'react-router-dom';
import { useBoardLamps } from '../hooks/useBoardLamps';
import { usePolls } from '../hooks/usePolls';
import { getOptions, getPollTotal } from '../lib/poll-utils';
import PollDecisionBadge from './PollDecisionBadge';
import type { BoardLamp, Poll } from '../types';

interface VoteBoardProps {
  layout?: 'screen' | 'panel';
}

export default function VoteBoard({ layout = 'screen' }: VoteBoardProps) {
  const { polls, loading: pollsLoading } = usePolls('voter');
  const { lamps, loading: lampsLoading, error } = useBoardLamps();
  const loading = pollsLoading || lampsLoading;
  const view = boardView(polls, lamps);
  const published = view.phase === 'closed' && view.poll?.showResults === true;
  const notice = published ? null : boardNotice(loading, error, view);

  if (layout === 'panel') {
    return (
      <section className="bg-surface rounded-2xl shadow-sm border border-border p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-gray-800">번호 현황판</h3>
            <p className="text-sm text-gray-500 mt-1">{view.caption}</p>
          </div>
          <Link to="/board" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary shrink-0">
            크게 보기
          </Link>
        </div>
        {published && view.poll && <BoardResult poll={view.poll} />}
        {view.phase === 'closed' && !published && !notice && (
          <p className="mb-3 text-sm text-gray-500">결과는 아직 공개되지 않았습니다.</p>
        )}
        {notice ? (
          <p className="text-sm text-gray-500">{notice}</p>
        ) : view.lamps.length > 0 ? (
          <div className={published ? 'mt-5' : undefined}>
            <BoardBody view={view} dense />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-background text-gray-900 flex flex-col">
      <header className="bg-primary text-white px-5 py-2.5 flex items-center justify-between gap-4">
        <h1 className="text-base font-semibold">
          {view.title}
          <span className="ml-2 text-sm font-normal text-white/70">{view.caption}</span>
        </h1>
        {!loading && (view.total > 0 || view.phase !== 'closed') && (
          <p className="text-sm tabular-nums shrink-0">
            <span className="text-white/70">투표 </span>
            <span className="font-semibold">{view.voted}</span>
            <span className="text-white/70"> / 전체 </span>
            <span className="font-semibold">{view.total}</span>
          </p>
        )}
      </header>
      <main className={notice ? 'flex-1 grid place-items-center px-6' : 'px-6 py-8'}>
        {notice ? (
          <p className="text-3xl text-gray-500">{notice}</p>
        ) : (
          <div className="mx-auto w-full max-w-5xl space-y-10">
            {published && view.poll && <BoardResult poll={view.poll} large />}
            {view.phase === 'closed' && !published && (
              <p className="text-center text-2xl text-gray-500">결과는 아직 공개되지 않았습니다.</p>
            )}
            {view.lamps.length > 0 && <BoardBody view={view} />}
          </div>
        )}
      </main>
    </div>
  );
}

function boardNotice(loading: boolean, error: string | null, view: BoardView): string | null {
  if (loading) return '불러오는 중...';
  if (view.phase === 'closed') return null;
  if (error || (view.lamps.length === 0 && view.phase === 'before')) return '입장한 사람이 없습니다.';
  if (view.lamps.length === 0) return '이번 투표에 포함된 번호가 없습니다.';
  return null;
}

function BoardBody({
  view,
  dense = false,
}: {
  view: BoardView;
  dense?: boolean;
}) {
  return (
    <div>
      <ul className={`grid gap-3 ${dense ? 'grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] max-h-80 overflow-y-auto' : 'grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))]'}`}>
        {view.lamps.map((lamp) => {
          const voted = lamp.state === 'voted';
          return (
            <li key={lamp.badge}>
              <div
                className={`grid size-16 place-items-center rounded-full text-lg font-bold tabular-nums ${voted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}
                aria-label={`${lamp.badge}번 ${voted ? '투표함' : '미투표'}`}
              >
                {lamp.badge}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-gray-500">
        초록 번호는 투표를 마쳤습니다. 회색 번호는 아직입니다.
      </p>
    </div>
  );
}

function BoardResult({ poll, large = false }: { poll: Poll; large?: boolean }) {
  const options = getOptions(poll);
  const total = getPollTotal(poll);
  const label = large ? 'text-3xl' : 'text-sm';
  const count = large ? 'text-3xl' : 'text-sm';
  const bar = large ? 'h-10' : 'h-5';

  return (
    <section className="space-y-6">
      <PollDecisionBadge poll={poll} />
      <div className={large ? 'space-y-6' : 'space-y-3'}>
        {options.map((option) => {
          const votes = poll.results?.[option] ?? 0;
          const percent = total > 0 ? Math.round((votes / total) * 100) : 0;
          return (
            <div key={option}>
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <span className={`${label} font-bold text-gray-800`}>{option}</span>
                <span className={`${count} font-semibold tabular-nums text-gray-700`}>
                  {votes}
                  <span className="font-normal text-gray-400">표 · {percent}%</span>
                </span>
              </div>
              <div className={`w-full overflow-hidden rounded-full bg-gray-200 ${bar}`}>
                <div
                  className={`${barColor(poll, option)} ${bar} rounded-full transition-all duration-500`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function barColor(poll: Poll, option: string): string {
  if (poll.type !== 'yesno') return 'bg-primary';
  if (option === '기권') return 'bg-gray-500';
  if (option === '찬성') return 'bg-primary';
  return 'bg-red-400';
}

interface BoardView {
  title: string;
  caption: string;
  phase: 'before' | 'live' | 'closed';
  lamps: BoardLamp[];
  voted: number;
  total: number;
  poll: Poll | null;
}

function boardView(polls: Poll[], lamps: BoardLamp[]): BoardView {
  const live = polls.find((poll) => poll.status === 'active' && poll.eligibilityMode === 'roster');
  if (live) return summarize(live.title, '진행 중', 'live', lamps.filter((lamp) => lamp.pollId === live.id), live);

  const linkedId = lamps.find((lamp) => lamp.pollId && lamp.state !== 'seated')?.pollId ?? '';
  const linked = polls.find((poll) => poll.id === linkedId && poll.eligibilityMode === 'roster');
  if (linked) {
    return summarize(linked.title, '마감', 'closed', lamps.filter((lamp) => lamp.pollId === linked.id), linked);
  }

  const newest = polls[0];
  if (newest?.status === 'closed') {
    return summarize(newest.title, '마감', 'closed', [], newest);
  }

  const seated = lamps.filter((lamp) => lamp.state === 'seated');
  return summarize('입장 현황', '투표 시작 전', 'before', seated, null);
}

function summarize(
  title: string,
  caption: string,
  phase: BoardView['phase'],
  rows: BoardLamp[],
  poll: Poll | null,
): BoardView {
  const voted = rows.filter((lamp) => lamp.state === 'voted').length;
  return { title, caption, phase, lamps: rows, voted, total: rows.length, poll };
}
