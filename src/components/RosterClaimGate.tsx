import { useState } from 'react';
import { claimRosterSeat } from '../lib/vote-service';
import type { RosterClaim, Voter } from '../types';

interface RosterClaimGateProps {
  voters: Voter[];
  claimedIds: Set<string>;
  loading: boolean;
  onClaimed: (claim: RosterClaim) => void;
}

export default function RosterClaimGate({ voters, claimedIds, loading, onClaimed }: RosterClaimGateProps) {
  const [roomCode, setRoomCode] = useState('');
  const [query, setQuery] = useState('');
  const [voterId, setVoterId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const available = voters.filter((voter) => voter.active && !claimedIds.has(voter.id));
  const selected = available.find((voter) => voter.id === voterId) ?? null;
  const keyword = normalizeName(query);
  const matches = keyword
    ? available.filter((voter) => normalizeName(voter.name).includes(keyword))
    : [];
  const visibleMatches = matches.slice(0, 30);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const voter = available.find((item) => item.id === voterId);
    if (!voter) {
      setError('이름을 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      onClaimed(await claimRosterSeat(voter, roomCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : '입장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-2">입장 이름을 선택해 주세요</h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-5">
        화면에 나온 입장 코드를 입력하고 본인 이름을 고르면 이번 모임 투표 인원에 포함됩니다.
        선택 내용은 이름과 함께 저장되지 않습니다.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="room-code" className="block text-sm font-medium text-gray-700 mb-1">
            입장 코드
          </label>
          <input
            id="room-code"
            inputMode="numeric"
            autoComplete="off"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-400"
            required
          />
        </div>
        <div>
          <label htmlFor="voter-name" className="block text-sm font-medium text-gray-700 mb-1">
            이름 검색
          </label>
          <input
            id="voter-name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVoterId('');
            }}
            placeholder={loading ? '명단 불러오는 중...' : '이름 일부를 입력하세요'}
            autoComplete="off"
            disabled={loading || available.length === 0}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {selected ? (
            <p className="mt-2 text-sm font-medium text-indigo-700">{selected.name} 님으로 입장합니다</p>
          ) : keyword ? (
            visibleMatches.length > 0 ? (
              <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                {visibleMatches.map((voter) => (
                  <button
                    key={voter.id}
                    type="button"
                    onClick={() => {
                      setVoterId(voter.id);
                      setQuery(voter.name);
                    }}
                    className="block w-full px-4 py-3 text-left text-gray-800 hover:bg-indigo-50"
                  >
                    {voter.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">일치하는 이름이 없습니다.</p>
            )
          ) : (
            <p className="mt-2 text-sm text-gray-400">본인 이름을 입력하면 목록에서 고를 수 있습니다.</p>
          )}
          {keyword && matches.length > visibleMatches.length && (
            <p className="mt-2 text-xs text-gray-400">
              {visibleMatches.length}명만 표시됩니다. 이름을 더 입력해 주세요.
            </p>
          )}
        </div>
        {!loading && available.length === 0 && (
          <p className="text-sm text-gray-500">선택할 수 있는 이름이 없습니다. 안내자에게 명단 추가를 요청해 주세요.</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !selected}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {submitting ? '확인 중...' : '입장하기'}
        </button>
      </form>
    </div>
  );
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}
