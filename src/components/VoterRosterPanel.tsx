import { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createAttendanceSession } from '../lib/vote-service';
import type { AttendanceSession, Voter } from '../types';

interface VoterRosterPanelProps {
  eventId: string;
}

export default function VoterRosterPanel({ eventId }: VoterRosterPanelProps) {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [name, setName] = useState('');
  const [externalQrId, setExternalQrId] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'voters'), orderBy('name', 'asc')), (snap) => {
      setVoters(
        snap.docs.map((voterDoc) => {
          const data = voterDoc.data();
          return {
            id: voterDoc.id,
            name: data.name ?? '이름 없음',
            externalQrId: data.externalQrId,
            memberNo: data.memberNo,
            active: data.active ?? true,
            createdAt: data.createdAt ?? 0,
          };
        }),
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attendanceSessions'), (snap) => {
      setSessions(
        snap.docs
          .map((sessionDoc) => ({ id: sessionDoc.id, ...sessionDoc.data() }) as AttendanceSession)
          .filter((session) => session.eventId === eventId && session.status === 'active'),
      );
    });
    return unsub;
  }, [eventId]);

  const addVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addDoc(collection(db, 'voters'), {
      name: name.trim(),
      externalQrId: externalQrId.trim(),
      active: true,
      createdAt: Date.now(),
    });
    setName('');
    setExternalQrId('');
  };

  const createSession = async (voter: Voter) => {
    setLoadingId(voter.id);
    try {
      await createAttendanceSession(voter, eventId);
    } finally {
      setLoadingId(null);
    }
  };

  const hasActiveSession = (voterId: string) => sessions.some((session) => session.voterId === voterId);

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-800">출석 인증 테스트/관리</h2>
        <p className="text-sm text-gray-400 mt-1">
          실제 QR 스캐너 연동 전까지 성도와 출석 세션을 수동으로 만들 수 있습니다.
        </p>
      </div>

      <form onSubmit={addVoter} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="성도 이름"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={externalQrId}
          onChange={(e) => setExternalQrId(e.target.value)}
          placeholder="QR/회원 식별값 (선택)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
          추가
        </button>
      </form>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {voters.map((voter) => {
          const active = hasActiveSession(voter.id);
          return (
            <div
              key={voter.id}
              className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2"
            >
              <div>
                <p className="font-medium text-gray-700">{voter.name}</p>
                <p className="text-xs text-gray-400">
                  {voter.externalQrId || voter.memberNo || voter.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${active ? 'text-green-600' : 'text-gray-400'}`}>
                  {active ? '출석 세션 있음' : '미출석'}
                </span>
                <button
                  type="button"
                  onClick={() => createSession(voter)}
                  disabled={loadingId === voter.id || active}
                  className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                >
                  {loadingId === voter.id ? '생성 중' : '출석 세션 생성'}
                </button>
              </div>
            </div>
          );
        })}
        {voters.length === 0 && <p className="text-sm text-gray-400">등록된 성도가 없습니다.</p>}
      </div>

      {sessions.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">투표 접속 URL</p>
          <div className="space-y-1">
            {sessions.slice(0, 5).map((session) => (
              <p key={session.id} className="text-xs text-gray-500 break-all">
                {session.voterName}: {window.location.origin}
                {window.location.pathname}#/v/{session.id}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
