import { useState } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { EligibilityMode, Poll, PollType } from '../types';

interface CreatePollFormProps {
  onClose: () => void;
  editPoll?: Poll;
}

export default function CreatePollForm({ onClose, editPoll }: CreatePollFormProps) {
  const isEdit = !!editPoll;

  const [title, setTitle] = useState(editPoll?.title ?? '');
  const [type, setType] = useState<PollType>(editPoll?.type ?? 'yesno');
  const [eligibilityMode, setEligibilityMode] = useState<EligibilityMode>(
    editPoll?.eligibilityMode ?? 'roster',
  );
  const [allowAbstain, setAllowAbstain] = useState(editPoll?.allowAbstain ?? true);
  const [eventId, setEventId] = useState(editPoll?.eventId ?? 'elder-vote');
  const [durationMinutes, setDurationMinutes] = useState(
    Math.max(1, Math.round((editPoll?.durationSeconds ?? 180) / 60)),
  );
  const [options, setOptions] = useState<string[]>(
    editPoll?.type === 'choice' ? editPoll.options : ['', '']
  );
  const [useQuorum, setUseQuorum] = useState(Boolean(editPoll?.quorumTarget));
  const [quorumTarget, setQuorumTarget] = useState(
    editPoll?.quorumTarget ? String(editPoll.quorumTarget) : '',
  );
  const [passPercent, setPassPercent] = useState(
    editPoll?.passRatio ? String(Math.round(editPoll.passRatio * 100)) : '50',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addOption = () => setOptions([...options, '']);
  const removeOption = (i: number) => setOptions(options.filter((_, idx) => idx !== i));
  const updateOption = (i: number, val: string) =>
    setOptions(options.map((o, idx) => (idx === i ? val : o)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (type === 'choice' && options.some((o) => !o.trim())) return;

    setLoading(true);
    setError('');
    try {
      const nextAllowAbstain = eligibilityMode === 'roster' && type === 'yesno' ? true : allowAbstain;
      const finalOptions =
        type === 'yesno'
          ? nextAllowAbstain
            ? ['찬성', '반대', '기권']
            : ['찬성', '반대']
          : options.map((o) => o.trim());
      const durationSeconds = durationMinutes * 60;
      const parsedQuorum = useQuorum ? Number(quorumTarget) : 0;
      const parsedPassRatio = Number(passPercent) / 100;

      const quorumFields: { quorumTarget?: number; passRatio?: number } = {};
      if (type === 'yesno') {
        quorumFields.passRatio = Number.isFinite(parsedPassRatio) && parsedPassRatio > 0 ? parsedPassRatio : 0.5;
        if (useQuorum && Number.isFinite(parsedQuorum) && parsedQuorum > 0) {
          quorumFields.quorumTarget = parsedQuorum;
        }
      }

      if (isEdit && editPoll) {
        await updateDoc(doc(db, 'polls', editPoll.id), {
          title: title.trim(),
          type,
          options: finalOptions,
          eligibilityMode,
          allowAbstain: nextAllowAbstain,
          eventId: eligibilityMode === 'attendance' ? eventId.trim() : '',
          durationSeconds,
          quorumTarget: quorumFields.quorumTarget ?? null,
          passRatio: quorumFields.passRatio ?? null,
        });
      } else {
        await addDoc(collection(db, 'polls'), {
          title: title.trim(),
          type,
          options: finalOptions,
          eligibilityMode,
          allowAbstain: nextAllowAbstain,
          eventId: eligibilityMode === 'attendance' ? eventId.trim() : '',
          durationSeconds,
          status: 'waiting',
          createdAt: Date.now(),
          results: Object.fromEntries(finalOptions.map((option) => [option, 0])),
          showResults: false,
          ...quorumFields,
        });
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <h2 className="px-6 pt-6 pb-4 text-xl font-bold text-gray-800">
          {isEdit ? '투표 수정' : '새 투표 만들기'}
        </h2>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto px-6 pb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">투표 주제</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 2025년 수련회 장소 결정"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">참여 방식</label>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEligibilityMode('roster');
                  setAllowAbstain(true);
                }}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  eligibilityMode === 'roster'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                현장 명단 (이름 선택)
              </button>
              <button
                type="button"
                onClick={() => setEligibilityMode('open')}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  eligibilityMode === 'open'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                누구나 참여 가능 (기존 방식)
              </button>
              <button
                type="button"
                onClick={() => { setEligibilityMode('attendance'); setAllowAbstain(true); }}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  eligibilityMode === 'attendance'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                QR 출석 인증 필요 (장로 선출)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">투표 유형</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType('yesno')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  type === 'yesno'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                찬반 투표
              </button>
              <button
                type="button"
                onClick={() => setType('choice')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  type === 'choice'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                다중 선택
              </button>
            </div>
          </div>

          {type === 'yesno' && eligibilityMode === 'roster' && (
            <p className="text-sm text-gray-500">
              시작 전까지 이름을 선택한 사람이 투표 인원입니다. 제한시간까지 선택하지 않은 사람은 기권으로 집계되고, 누가 무엇을 골랐는지는 저장되지 않습니다.
            </p>
          )}

          {type === 'yesno' && eligibilityMode !== 'roster' && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={allowAbstain}
                  onChange={(e) => setAllowAbstain(e.target.checked)}
                  className="w-4 h-4"
                />
                기권 선택지를 포함합니다
              </label>
            </>
          )}

          {type === 'yesno' && (
            <>
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={useQuorum}
                    onChange={(e) => setUseQuorum(e.target.checked)}
                    className="w-4 h-4"
                  />
                  정족수(최소 참여 인원) 설정
                </label>
                {useQuorum && (
                  <input
                    type="number"
                    min={1}
                    value={quorumTarget}
                    onChange={(e) => setQuorumTarget(e.target.value)}
                    placeholder="예) 30 (명)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    가결 기준 (찬성 비율 %)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={passPercent}
                    onChange={(e) => setPassPercent(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    기권을 제외한 찬성/반대 중 찬성 비율이 이 값 이상이면 가결로 표시됩니다. 기본 50%(과반).
                  </p>
                </div>
              </div>
            </>
          )}

          {eligibilityMode === 'roster' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제한시간(분)</label>
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>
          )}

          {eligibilityMode === 'attendance' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">행사 ID</label>
                <input
                  type="text"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">제한시간(분)</label>
                <input
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  required
                />
              </div>
            </div>
          )}

          {type === 'choice' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">선택지</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`선택지 ${i + 1}`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      required
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="text-red-400 hover:text-red-600 px-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + 선택지 추가
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 break-all">
              {error}
            </div>
          )}

          </div>
          <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? (isEdit ? '저장 중...' : '생성 중...') : isEdit ? '저장' : '만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
