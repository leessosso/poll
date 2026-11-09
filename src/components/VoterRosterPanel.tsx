import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMeetingCode } from '../hooks/useMeetingCode';
import { useRosterDirectory } from '../hooks/useRosterDirectory';
import { rotateRoomCode, startNewMeeting } from '../lib/meeting';
import {
  createAttendanceSession,
  reissueRosterClaim,
  releaseRosterClaim,
  removeVoterFromRoster,
  revokeAttendanceSession,
} from '../lib/vote-service';
import type { AttendanceSession, Poll, Voter } from '../types';

interface VoterRosterPanelProps {
  eventId: string;
  activePoll: Poll | null;
}

export default function VoterRosterPanel({ eventId, activePoll }: VoterRosterPanelProps) {
  const { voters, claimedIds, reissueIds, badgeByVoterId } = useRosterDirectory('admin');
  const { roomCode, meetingId, loading: codeLoading } = useMeetingCode();
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [namesText, setNamesText] = useState('');
  const [adding, setAdding] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attendanceSessions'), (snap) => {
      setSessions(
        snap.docs
          .map((sessionDoc) => ({ id: sessionDoc.id, ...sessionDoc.data() }) as AttendanceSession)
          .filter(
            (session) =>
              session.eventId === eventId && session.status === 'active' && session.expiresAt > Date.now(),
          ),
      );
    });
    return unsub;
  }, [eventId]);

  const parsedNames = parseRosterNames(namesText);

  const addVoters = async (e: React.FormEvent) => {
    e.preventDefault();
    const existing = new Set(voters.map((voter) => voter.name.trim()));
    const fresh = parsedNames.filter((voterName) => !existing.has(voterName));
    const skipped = parsedNames.length - fresh.length;
    if (fresh.length === 0) {
      setNotice({
        text: parsedNames.length === 0 ? '이름을 입력해 주세요.' : '입력한 이름은 이미 명단에 있습니다.',
        tone: 'error',
      });
      return;
    }

    setAdding(true);
    setNotice(null);
    try {
      const now = Date.now();
      for (let offset = 0; offset < fresh.length; offset += 400) {
        const batch = writeBatch(db);
        fresh.slice(offset, offset + 400).forEach((voterName) => {
          const voterRef = doc(collection(db, 'voters'));
          batch.set(voterRef, {
            name: voterName,
            externalQrId: '',
            active: true,
            createdAt: now,
          });
          batch.set(doc(db, 'voterDirectory', voterRef.id), {
            name: voterName,
            active: true,
            createdAt: now,
          });
        });
        await batch.commit();
      }
      setNamesText('');
      setNotice({
        text:
          skipped > 0
            ? `${fresh.length}명을 추가했습니다. 이미 있는 이름 ${skipped}명은 건너뛰었습니다.`
            : `${fresh.length}명을 추가했습니다.`,
        tone: 'ok',
      });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : '명단을 추가하지 못했습니다.', tone: 'error' });
    } finally {
      setAdding(false);
    }
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

  const changeRoomCode = async () => {
    setNotice(null);
    setMeetingBusy(true);
    try {
      await rotateRoomCode(meetingId);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : '입장 코드를 바꾸지 못했습니다.', tone: 'error' });
    } finally {
      setMeetingBusy(false);
    }
  };

  const beginMeeting = async () => {
    if (activePoll) {
      setNotice({ text: '진행 중인 투표를 마감한 뒤 새 모임을 시작해 주세요.', tone: 'error' });
      return;
    }
    if (
      meetingId &&
      !confirm('새 모임을 시작할까요?\n지금까지의 입장과 현황판 번호는 모두 비워지고, 모두 새 입장 코드로 다시 입장해야 합니다.\n(지난 기록은 지우지 않고 보관됩니다.)')
    ) {
      return;
    }
    setNotice(null);
    setMeetingBusy(true);
    try {
      await startNewMeeting();
      setNotice({ text: '새 모임을 시작했습니다. 새 입장 코드를 화면에 띄워 주세요.', tone: 'ok' });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : '새 모임을 시작하지 못했습니다.', tone: 'error' });
    } finally {
      setMeetingBusy(false);
    }
  };

  const reissueClaim = async (voter: Voter) => {
    if (!confirm(`"${voter.name}" 님을 새 기기로 다시 연결할까요?\n지금 기기의 입장은 풀리고, 새 기기에서 같은 이름을 고르면 같은 번호로 들어옵니다.`)) return;
    setReissuingId(voter.id);
    setNotice(null);
    try {
      await reissueRosterClaim(voter.id, activePoll);
      setNotice({ text: `${voter.name} 님은 이제 새 기기에서 입장 코드와 이름을 다시 고르면 됩니다.`, tone: 'ok' });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : '다시 연결하지 못했습니다.', tone: 'error' });
    } finally {
      setReissuingId(null);
    }
  };

  const removeVoter = async (voter: Voter) => {
    if (!confirm(`"${voter.name}" 님을 명단에서 제거할까요?`)) return;
    setRemovingId(voter.id);
    setNotice(null);
    try {
      await removeVoterFromRoster(voter.id, activePoll);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : '명단에서 제거하지 못했습니다.', tone: 'error' });
    } finally {
      setRemovingId(null);
    }
  };

  const releaseClaim = async (voter: Voter) => {
    setReleasingId(voter.id);
    setNotice(null);
    try {
      await releaseRosterClaim(voter.id, activePoll);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : '입장을 해제하지 못했습니다.', tone: 'error' });
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <section className="bg-surface rounded-2xl shadow-sm border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-800">현장 입장</h2>
          <p className="text-sm text-gray-400 mt-1">
            이 코드를 화면에 띄우세요. 투표 시작 전에 이름을 고른 사람이 이번 투표 인원입니다. 모임마다 '새 모임 시작'으로 입장을 비우고 시작하세요.
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tracking-widest text-primary">
            {codeLoading ? '----' : meetingId && roomCode ? roomCode : '없음'}
          </p>
          <div className="flex flex-col items-end gap-1 mt-1">
            {meetingId && roomCode && (
              <button type="button" onClick={changeRoomCode} disabled={meetingBusy} className="text-xs text-primary disabled:opacity-40">
                코드 바꾸기
              </button>
            )}
            <button
              type="button"
              onClick={beginMeeting}
              disabled={meetingBusy || Boolean(activePoll)}
              className="text-xs font-semibold text-white bg-primary rounded-lg px-2.5 py-1.5 disabled:opacity-40"
            >
              새 모임 시작(입장 초기화)
            </button>
          </div>
        </div>
      </div>
      {notice && (
        <p className={`text-sm ${notice.tone === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{notice.text}</p>
      )}
      <div>
        <h2 className="font-bold text-gray-800">명단</h2>
        <p className="text-sm text-gray-400 mt-1">
          한 줄에 한 명씩 붙여 넣으면 함께 등록됩니다. 잘못 넣은 이름은 명단에서 제거할 수 있습니다.
        </p>
      </div>

      <form onSubmit={addVoters} className="space-y-2">
        <label htmlFor="roster-names" className="block text-sm font-medium text-gray-700">
          이름
        </label>
        <textarea
          id="roster-names"
          value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          placeholder={'김철수\n이영희\n박민수'}
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">{parsedNames.length}명</p>
          <button
            type="submit"
            disabled={adding || parsedNames.length === 0}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          >
            {adding ? '추가 중...' : '명단 추가'}
          </button>
        </div>
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
                <span
                  className={`text-xs ${
                    claimedIds.has(voter.id) ? 'text-green-600' : reissueIds.has(voter.id) ? 'text-accent' : 'text-gray-400'
                  }`}
                >
                  {claimedIds.has(voter.id)
                    ? `입장함${badgeByVoterId.get(voter.id) ? ` · ${badgeByVoterId.get(voter.id)}번` : ''}`
                    : reissueIds.has(voter.id)
                      ? '새 기기 연결 대기'
                      : '미입장'}
                </span>
                {claimedIds.has(voter.id) && (
                  <button
                    type="button"
                    onClick={() => reissueClaim(voter)}
                    disabled={reissuingId === voter.id}
                    className="text-xs text-primary disabled:opacity-40"
                  >
                    {reissuingId === voter.id ? '처리 중' : '다시 연결(재발급)'}
                  </button>
                )}
                {(claimedIds.has(voter.id) || reissueIds.has(voter.id)) && (
                  <button
                    type="button"
                    onClick={() => releaseClaim(voter)}
                    disabled={releasingId === voter.id}
                    className="text-xs text-red-500 disabled:opacity-40"
                  >
                    {releasingId === voter.id ? '해제 중' : '입장 해제'}
                  </button>
                )}
                <span className={`text-xs ${active ? 'text-green-600' : 'text-gray-400'}`}>
                  {active ? '출석 세션 있음' : '미출석'}
                </span>
                <button
                  type="button"
                  onClick={() => removeVoter(voter)}
                  disabled={removingId === voter.id}
                  className="text-xs text-red-500 disabled:opacity-40"
                >
                  {removingId === voter.id ? '제거 중' : '명단 제거'}
                </button>
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
              <div key={session.id} className="flex items-start justify-between gap-3">
                <p className="text-xs text-gray-500 break-all">
                  {session.voterName}: {window.location.origin}
                  {import.meta.env.BASE_URL}v/{session.id}
                </p>
                <button
                  type="button"
                  onClick={() => revokeAttendanceSession(session.id)}
                  className="shrink-0 text-xs text-red-500"
                >
                  지우기
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function parseRosterNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of text.split(/[\n,，]+/)) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
