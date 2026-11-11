import { useState } from 'react';
import { updateExpectedCount } from '../lib/vote-service';
import type { Poll } from '../types';

interface HeadcountPanelProps {
  poll: Poll;
  presenceCount: number;
  checkinCount: number;
}

export default function HeadcountPanel({ poll, presenceCount, checkinCount }: HeadcountPanelProps) {
  const [draft, setDraft] = useState(String(poll.expectedCount ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const expected = poll.expectedCount;
  const over = typeof expected === 'number' && (presenceCount > expected || checkinCount > expected);

  const save = async () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1) {
      setError('확정 인원은 1명 이상이어야 합니다.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateExpectedCount(poll.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '확정 인원을 바꾸지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-gray-800">현장 인원</h2>
        {typeof expected === 'number' ? (
          <p className="text-sm text-gray-500">투표는 {expected}표에서 멈춥니다</p>
        ) : (
          <p className="text-sm text-gray-500">확정 인원이 없어 표 수 상한이 없습니다</p>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Count label="확정" value={expected ?? '—'} />
        <Count label="접속" value={presenceCount} />
        <Count label="입장" value={checkinCount} />
        <Count label="투표" value={poll.castCount} />
      </div>
      {over && (
        <p className="text-sm text-accent leading-relaxed">
          접속 또는 입장이 확정 인원보다 많습니다. 현장에서 인원을 확인한 뒤 확정 인원을 조정하세요.
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError('');
          }}
          className="w-28 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
          aria-label="확정 인원"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? '저장 중...' : '인원 조정'}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-background border border-border py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  );
}

interface StartHeadcountDialogProps {
  defaultCount: number;
  hint?: string;
  submitting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (expectedCount: number) => void;
}

export function StartHeadcountDialog({
  defaultCount,
  hint,
  submitting,
  error,
  onCancel,
  onConfirm,
}: StartHeadcountDialogProps) {
  const [draft, setDraft] = useState(defaultCount > 0 ? String(defaultCount) : '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(Number(draft));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-surface rounded-2xl shadow-sm border border-border p-6 w-full max-w-sm space-y-4">
        <h2 className="text-xl font-bold text-gray-800">확정 인원</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          현장에서 확인한 인원을 입력하면 그 수만큼만 투표가 집계됩니다. 인원이 바뀌면 진행 중에도 조정할 수 있습니다.
        </p>
        {hint ? <p className="text-sm text-gray-500 leading-relaxed">{hint}</p> : null}
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-primary/35"
          aria-label="확정 인원"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-border text-gray-600 py-3 rounded-xl font-semibold"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? '시작 중...' : '투표 시작'}
          </button>
        </div>
      </form>
    </div>
  );
}
