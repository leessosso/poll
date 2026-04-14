import { useState } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Poll, PollType } from '../types';

interface CreatePollFormProps {
  onClose: () => void;
  editPoll?: Poll;
}

export default function CreatePollForm({ onClose, editPoll }: CreatePollFormProps) {
  const isEdit = !!editPoll;

  const [title, setTitle] = useState(editPoll?.title ?? '');
  const [type, setType] = useState<PollType>(editPoll?.type ?? 'yesno');
  const [options, setOptions] = useState<string[]>(
    editPoll?.type === 'choice' ? editPoll.options : ['', '']
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
      const finalOptions = type === 'yesno' ? ['찬성', '반대'] : options.map((o) => o.trim());

      if (isEdit && editPoll) {
        await updateDoc(doc(db, 'polls', editPoll.id), {
          title: title.trim(),
          type,
          options: finalOptions,
        });
      } else {
        await addDoc(collection(db, 'polls'), {
          title: title.trim(),
          type,
          options: finalOptions,
          status: 'waiting',
          createdAt: Date.now(),
          results: {},
          showResults: false,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <h2 className="text-xl font-bold text-gray-800 mb-5">
          {isEdit ? '투표 수정' : '새 투표 만들기'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex gap-3 pt-2">
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
