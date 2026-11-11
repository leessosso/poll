import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TILE_GAP_RATIO, fitTiles } from '../lib/board-fit';
import { useBoardLamps } from '../hooks/useBoardLamps';
import { usePolls } from '../hooks/usePolls';
import { getOptions, getPollDecision, getPollTotal } from '../lib/poll-utils';
import BoardEntryQr from './BoardEntryQr';
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
    <div className={`${notice || published ? 'min-h-screen' : 'h-screen overflow-hidden'} bg-background text-gray-900 flex flex-col`}>
      <header className="bg-primary text-white px-8 py-4 flex items-center justify-between gap-6">
        <h1 className="text-[clamp(1.5rem,2.2vw,3rem)] font-semibold">
          {view.title}
          <span className="ml-3 text-[clamp(1.15rem,1.6vw,2rem)] font-normal text-white/70">{view.caption}</span>
        </h1>
        <div className="flex items-center gap-4 shrink-0">
          {!loading && (view.total > 0 || view.phase !== 'closed') && (
            <p className="text-[clamp(1.5rem,2.2vw,3rem)] tabular-nums">
              <span className="text-white/70">투표 </span>
              <span className="font-semibold">{view.voted}</span>
              <span className="text-white/70"> / 전체 </span>
              <span className="font-semibold">{view.total}</span>
            </p>
          )}
          <BoardEntryQr />
        </div>
      </header>
      {notice || published ? (
        <main className="flex-1 grid place-items-center overflow-y-auto px-10 py-10">
          {notice ? (
            <p className="text-center text-[clamp(4.5rem,6vw,8rem)] font-semibold leading-tight text-gray-600">{notice}</p>
          ) : (
            <div className="w-[min(92vw,88rem)] space-y-12">
              {/* 결과를 공개하면 번호판 대신 결과만 크게 보인다. */}
              {view.poll && <BoardResult poll={view.poll} large />}
            </div>
          )}
        </main>
      ) : (
        <main className="flex-1 min-h-0 flex flex-col px-8 py-6">
          {view.phase === 'closed' && (
            <p className="shrink-0 pb-6 text-center text-[clamp(3rem,4.5vw,6rem)] font-semibold leading-tight text-gray-600">결과는 아직 공개되지 않았습니다.</p>
          )}
          {view.lamps.length > 0 && <FitBoard lamps={view.lamps} />}
        </main>
      )}
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
      <ul className={`grid ${dense ? 'max-h-80 grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-3 overflow-y-auto' : 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-6'}`}>
        {view.lamps.map((lamp) => {
          const voted = lamp.state === 'voted';
          return (
            <li key={lamp.badge} className={dense ? undefined : 'flex justify-center'}>
              <div
                className={`grid place-items-center rounded-full font-bold tabular-nums ${dense ? 'size-16 text-lg' : 'size-[clamp(6.5rem,8vw,9rem)] text-[clamp(1.75rem,2.4vw,3rem)]'} ${voted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}
                aria-label={`${lamp.badge}번 ${voted ? '투표함' : '미투표'}`}
              >
                {lamp.badge}
              </div>
            </li>
          );
        })}
      </ul>
      <p className={dense ? 'mt-4 text-sm text-gray-500' : 'mt-8 text-center text-2xl text-gray-500'}>
        초록 번호는 투표를 마쳤습니다. 회색 번호는 아직입니다.
      </p>
    </div>
  );
}

function FitBoard({ lamps }: { lamps: BoardLamp[] }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    const measure = () => setArea({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { size, cols } = fitTiles(lamps.length, area.width, area.height);
  const gap = Math.floor(size * TILE_GAP_RATIO);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={areaRef} className="flex-1 min-h-0 overflow-hidden">
        {size > 0 && (
          <ul
            className="grid justify-center content-center h-full"
            style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: `${gap}px` }}
          >
            {lamps.map((lamp) => {
              const voted = lamp.state === 'voted';
              return (
                <li key={lamp.badge}>
                  <div
                    className={`grid place-items-center rounded-full font-bold tabular-nums ${voted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}
                    style={{ width: size, height: size, fontSize: Math.max(14, Math.floor(size * 0.38)) }}
                    aria-label={`${lamp.badge}번 ${voted ? '투표함' : '미투표'}`}
                  >
                    {lamp.badge}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="shrink-0 pt-4 text-center text-[clamp(1.5rem,1.8vw,2.5rem)] text-gray-600">
        초록 번호는 투표를 마쳤습니다. 회색 번호는 아직입니다.
      </p>
    </div>
  );
}

function BoardResult({ poll, large = false }: { poll: Poll; large?: boolean }) {
  const options = getOptions(poll);
  const total = getPollTotal(poll);
  const label = large ? 'text-[clamp(3rem,4.5vw,6rem)]' : 'text-sm';
  const count = large ? 'text-[clamp(3rem,4.5vw,6rem)]' : 'text-sm';
  const bar = large ? 'h-[clamp(4rem,6vw,7rem)]' : 'h-5';

  return (
    <section className={large ? 'space-y-12' : 'space-y-6'}>
      {large ? <LargeDecision poll={poll} /> : <PollDecisionBadge poll={poll} />}
      <div className={large ? 'space-y-10' : 'space-y-3'}>
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

function LargeDecision({ poll }: { poll: Poll }) {
  if (poll.type !== 'yesno' || (!poll.quorumTarget && poll.passRatio == null)) return null;
  const result = getPollDecision(poll);
  if (result.decision === 'quorum-not-met') {
    return <p className="text-center text-[clamp(3.5rem,6vw,7rem)] font-bold text-yellow-700">정족수 미달</p>;
  }
  if (result.decision === 'passed') {
    return <p className="text-center text-[clamp(4rem,7vw,8rem)] font-bold text-primary">가결</p>;
  }
  if (result.decision === 'rejected') {
    return <p className="text-center text-[clamp(4rem,7vw,8rem)] font-bold text-red-600">부결</p>;
  }
  return null;
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
  const today = kstDay(Date.now());
  const todays = polls.filter((poll) => isSameKstDay(poll, today));
  const live = todays.find((poll) => poll.status === 'active' && poll.eligibilityMode === 'roster');
  if (live) return summarize(live.title, '진행 중', 'live', lamps.filter((lamp) => lamp.pollId === live.id), live);

  const linkedId = lamps.find((lamp) => lamp.pollId && lamp.state !== 'seated')?.pollId ?? '';
  const linked = todays.find((poll) => poll.id === linkedId && poll.eligibilityMode === 'roster');
  if (linked) {
    return summarize(linked.title, '마감', 'closed', lamps.filter((lamp) => lamp.pollId === linked.id), linked);
  }

  const newest = todays[0];
  if (newest?.status === 'closed') {
    return summarize(newest.title, '마감', 'closed', [], newest);
  }

  const seated = lamps.filter((lamp) => lamp.state === 'seated');
  return summarize('입장 현황', '투표 시작 전', 'before', seated, null);
}

function kstDay(timestamp: number): string {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isSameKstDay(poll: Poll, today: string): boolean {
  return [poll.createdAt, poll.startedAt, poll.closedAt].some(
    (value) => typeof value === 'number' && value > 0 && kstDay(value) === today,
  );
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
