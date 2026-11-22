import { useState } from 'react';
import { ROOM_CODE_LENGTH } from '../lib/meeting';
import { claimRosterSeat } from '../lib/vote-service';
import type { RosterClaim } from '../types';

interface RosterClaimGateProps {
  /** 관리자가 새 모임을 시작해 입장이 열려 있는지 */
  meetingOpen: boolean;
  onClaimed: (claim: RosterClaim) => void;
}

export default function RosterClaimGate({ meetingOpen, onClaimed }: RosterClaimGateProps) {
  const [roomCode, setRoomCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== ROOM_CODE_LENGTH) {
      setError(`입장 코드 ${ROOM_CODE_LENGTH}자리 숫자를 입력해 주세요.`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      onClaimed(await claimRosterSeat(roomCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : '입장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!meetingOpen) {
    return (
      <div className="bg-surface rounded-2xl p-8 text-center shadow-sm border border-border">
        <p className="text-gray-800 font-semibold mb-2">아직 입장이 열리지 않았습니다</p>
        <p className="text-gray-500">안내자가 입장 코드를 띄우면 이 화면에서 입장할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-sm border border-border">
      <h2 className="text-xl font-bold text-gray-800 mb-2">입장 코드를 입력해 주세요</h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-5">
        화면에 나온 입장 코드 6자리를 입력하면 이번 모임 투표에 입장합니다.
        비밀투표로 진행되며, 누가 무엇을 선택했는지는 저장되지 않습니다.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="room-code" className="block text-sm font-medium text-gray-700 mb-1">
            입장 코드
          </label>
          <input
            id="room-code"
            inputMode="numeric"
            pattern={`[0-9]{${ROOM_CODE_LENGTH}}`}
            maxLength={ROOM_CODE_LENGTH}
            placeholder={`숫자 ${ROOM_CODE_LENGTH}자리`}
            autoComplete="off"
            autoFocus
            value={roomCode}
            onChange={(e) => {
              setRoomCode(e.target.value.replace(/[^0-9]/g, '').slice(0, ROOM_CODE_LENGTH));
              if (error) setError('');
            }}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/35"
            required
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || roomCode.length !== ROOM_CODE_LENGTH}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50"
        >
          {submitting ? '확인 중...' : '입장하기'}
        </button>
      </form>
    </div>
  );
}
