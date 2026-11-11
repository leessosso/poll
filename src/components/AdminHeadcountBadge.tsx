import { formatKstTime } from '../lib/kst-date';

interface AdminHeadcountBadgeProps {
  visitorCount: number;
  presenceCount: number;
  checkinCount: number;
  refreshing: boolean;
  updatedAt: number | null;
  onRefresh: () => void;
}

/** 관리자 헤더의 방문·접속·입장 인원. 실시간으로도 바뀌고, 버튼으로 다시 불러올 수 있다. */
export default function AdminHeadcountBadge({
  visitorCount,
  presenceCount,
  checkinCount,
  refreshing,
  updatedAt,
  onRefresh,
}: AdminHeadcountBadgeProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white/15 rounded-full px-3 py-1">
      <span className="w-2 h-2 bg-accent rounded-full animate-pulse shrink-0" aria-hidden />
      <span className="text-sm font-medium">
        오늘 방문 {visitorCount}명 · 접속 {presenceCount}명 · 이번 모임 입장 {checkinCount}명
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="grid place-items-center size-6 rounded-full text-white/90 hover:bg-white/20 disabled:opacity-60"
        aria-label="인원 다시 불러오기"
        title="인원 다시 불러오기"
      >
        <RefreshIcon spinning={refreshing} />
      </button>
      <span className="text-xs text-white/75" aria-live="polite">
        {refreshing ? '갱신 중...' : updatedAt ? `방금 갱신 · ${formatKstTime(updatedAt)}` : null}
      </span>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-3.5 ${spinning ? 'animate-spin' : ''}`}
      aria-hidden
    >
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.5 4.5v4h-4" />
    </svg>
  );
}
