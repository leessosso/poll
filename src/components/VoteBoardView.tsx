import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RESULT_TWO_COL_FROM, TILE_GAP_RATIO, fitBoardResults, fitTiles } from '../lib/board-fit';
import { getOptions, getPollDecision, getPollTotal } from '../lib/poll-utils';
import PollDecisionBadge from './PollDecisionBadge';
import type { BoardView } from '../lib/board-view';
import type { BoardLamp, Poll } from '../types';

interface VoteBoardViewProps {
  layout?: 'screen' | 'panel';
  view: BoardView;
  loading: boolean;
  error: string | null;
  headerExtra?: ReactNode;
  /** 투표 사이 준비 화면. 이전 결과 대신 안내 문구를 보여준다. */
  standby?: boolean;
  /** 현재 모임 입장 인원. 관리자 현황판에서만 쓴다. */
  entryCount?: number;
  showEntryCount?: boolean;
  boardControls?: ReactNode;
}

export default function VoteBoardView({
  layout = 'screen',
  view,
  loading,
  error,
  headerExtra,
  standby = false,
  entryCount = 0,
  showEntryCount = false,
  boardControls,
}: VoteBoardViewProps) {
  const published = !standby && view.phase === 'closed' && view.poll?.showResults === true;
  const notice = standby || published ? null : boardNotice(loading, error, view);

  if (layout === 'panel') {
    return (
      <section className="bg-surface rounded-2xl shadow-sm border border-border p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-gray-800">번호 현황판</h3>
            <p className="text-sm text-gray-500 mt-1">{standby ? '다음 투표 준비 중' : view.caption}</p>
          </div>
          {headerExtra}
        </div>
        {boardControls}
        {standby ? (
          <p className="mb-3 text-center text-base font-semibold text-gray-700">다음 투표를 준비 중입니다</p>
        ) : (
          <>
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
          </>
        )}
      </section>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-gray-900 flex flex-col">
      <header className="shrink-0 bg-primary text-white px-[clamp(1rem,2vw,2rem)] py-[clamp(0.35rem,1.4vh,1rem)] flex items-center justify-between gap-4">
        <h1 className="min-w-0 text-[clamp(1.15rem,2.2vw,3rem)] font-semibold leading-tight">
          {standby ? '현황판' : view.title}
          <span className="ml-3 text-[clamp(0.9rem,1.6vw,2rem)] font-normal text-white/70">
            {standby ? '준비 중' : view.caption}
          </span>
        </h1>
        <div className="flex items-center gap-4 shrink-0">
          {standby && showEntryCount && (
            <p className="text-[clamp(1.15rem,2.2vw,3rem)] tabular-nums leading-tight">
              <span className="text-white/70">입장 </span>
              <span className="font-semibold">{entryCount}</span>
            </p>
          )}
          {!standby && !loading && (view.total > 0 || view.phase !== 'closed') && (
            <p className="text-[clamp(1.15rem,2.2vw,3rem)] tabular-nums leading-tight">
              <span className="text-white/70">투표 </span>
              <span className="font-semibold">{view.voted}</span>
              <span className="text-white/70"> / 전체 </span>
              <span className="font-semibold">{view.total}</span>
            </p>
          )}
          {headerExtra}
        </div>
      </header>
      {standby ? (
        <main className="flex-1 min-h-0 overflow-hidden grid place-items-center px-[clamp(1rem,2.5vw,2.5rem)] py-[clamp(0.5rem,2vh,1.5rem)]">
          <p className="text-center text-[clamp(2rem,8vh,8rem)] font-semibold leading-tight text-gray-600">
            다음 투표를 준비 중입니다
          </p>
        </main>
      ) : notice || published ? (
        <main className="flex-1 min-h-0 overflow-hidden px-[clamp(1rem,2.5vw,2.5rem)] py-[clamp(0.5rem,2vh,1.5rem)]">
          {notice ? (
            <div className="grid h-full place-items-center">
              <p className="text-center text-[clamp(2rem,8vh,8rem)] font-semibold leading-tight text-gray-600">{notice}</p>
            </div>
          ) : (
            <div className="mx-auto h-full min-h-0 w-[min(96%,88rem)]">
              {/* 결과를 공개하면 번호판 대신 결과만 크게 보인다. 한 화면에 맞춰 크기를 줄인다. */}
              {view.poll && <BoardResult poll={view.poll} large />}
            </div>
          )}
        </main>
      ) : (
        <main className="flex-1 min-h-0 flex flex-col px-[clamp(1rem,2vw,2rem)] py-[clamp(0.5rem,1.5vh,1.5rem)]">
          {view.phase === 'closed' && (
            <p className="shrink-0 pb-[clamp(0.5rem,1.5vh,1.5rem)] text-center text-[clamp(1.5rem,6vh,6rem)] font-semibold leading-tight text-gray-600">결과는 아직 공개되지 않았습니다.</p>
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
      <p className="shrink-0 pt-[clamp(0.25rem,1vh,1rem)] text-center text-[clamp(0.9rem,3vh,2.5rem)] text-gray-600">
        초록 번호는 투표를 마쳤습니다. 회색 번호는 아직입니다.
      </p>
    </div>
  );
}

function BoardResult({ poll, large = false }: { poll: Poll; large?: boolean }) {
  if (large) return <FitBoardResult poll={poll} />;

  const options = getOptions(poll);
  const total = getPollTotal(poll);
  const columns = options.length >= RESULT_TWO_COL_FROM ? 2 : 1;

  return (
    <section className="space-y-4">
      <PollDecisionBadge poll={poll} />
      <div className={columns === 2 ? 'grid grid-cols-2 gap-x-4 gap-y-3' : 'space-y-3'}>
        {options.map((option) => {
          const votes = poll.results?.[option] ?? 0;
          const percent = total > 0 ? Math.round((votes / total) * 100) : 0;
          return (
            <div key={option} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold text-gray-800">{option}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">
                  {votes}
                  <span className="font-normal text-gray-400">표 · {percent}%</span>
                </span>
              </div>
              <div className="h-5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`${barColor(poll, option)} h-5 rounded-full transition-all duration-500`}
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

function showsLargeDecision(poll: Poll): boolean {
  if (poll.type !== 'yesno' || (!poll.quorumTarget && poll.passRatio == null)) return false;
  const decision = getPollDecision(poll).decision;
  return decision === 'quorum-not-met' || decision === 'passed' || decision === 'rejected';
}

function FitBoardResult({ poll }: { poll: Poll }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    const measure = () => setHeight(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const options = getOptions(poll);
  const total = getPollTotal(poll);
  const hasDecision = showsLargeDecision(poll);
  const fit = fitBoardResults(height, options.length, hasDecision);

  return (
    <section ref={areaRef} className="flex h-full min-h-0 flex-col justify-center overflow-hidden">
      {hasDecision && height > 0 && <LargeDecision poll={poll} fontPx={fit.verdictPx} />}
      {height > 0 && (
        <div
          className={fit.columns === 2 ? 'grid min-h-0 grid-cols-2' : 'flex min-h-0 flex-col'}
          style={{
            gap: `${fit.rowGapPx}px ${fit.colGapPx}px`,
            marginTop: hasDecision ? fit.verdictGapPx : 0,
          }}
        >
          {options.map((option) => {
            const votes = poll.results?.[option] ?? 0;
            const percent = total > 0 ? Math.round((votes / total) * 100) : 0;
            return (
              <div key={option} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: fit.labelBarGapPx }}>
                  <span className="truncate font-bold text-gray-800" style={{ fontSize: fit.labelPx, lineHeight: 1.2 }}>
                    {option}
                  </span>
                  <span
                    className="shrink-0 font-semibold tabular-nums text-gray-700"
                    style={{ fontSize: fit.metaPx, lineHeight: 1.2 }}
                  >
                    {votes}
                    <span className="font-normal text-gray-400">표 · {percent}%</span>
                  </span>
                </div>
                <div className="w-full overflow-hidden rounded-full bg-gray-200" style={{ height: fit.barPx }}>
                  <div
                    className={`${barColor(poll, option)} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LargeDecision({ poll, fontPx }: { poll: Poll; fontPx: number }) {
  const result = getPollDecision(poll);
  const long = result.decision === 'quorum-not-met';
  const size = long ? Math.round(fontPx * 0.85) : fontPx;
  if (result.decision === 'quorum-not-met') {
    return (
      <p className="shrink-0 text-center font-bold text-yellow-700" style={{ fontSize: size, lineHeight: 1.15 }}>
        정족수 미달
      </p>
    );
  }
  if (result.decision === 'passed') {
    return (
      <p className="shrink-0 text-center font-bold text-primary" style={{ fontSize: size, lineHeight: 1.15 }}>
        가결
      </p>
    );
  }
  if (result.decision === 'rejected') {
    return (
      <p className="shrink-0 text-center font-bold text-red-600" style={{ fontSize: size, lineHeight: 1.15 }}>
        부결
      </p>
    );
  }
  return null;
}

function barColor(poll: Poll, option: string): string {
  if (poll.type !== 'yesno') return 'bg-primary';
  if (option === '기권') return 'bg-gray-500';
  if (option === '찬성') return 'bg-primary';
  return 'bg-red-400';
}
