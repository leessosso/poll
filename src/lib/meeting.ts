import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/** 입장 코드 원문과 현재 모임 id. 관리자만 읽는다. */
export const MEETING_DOC = doc(db, 'meeting', 'current');
/** 현재 모임 id 만 담는다. 투표자와 현황판이 읽는다. */
export const MEETING_PUBLIC_DOC = doc(db, 'meetingPublic', 'current');

export function newMeetingId(): string {
  return `mtg_${crypto.randomUUID()}`;
}

export const ROOM_CODE_LENGTH = 6;

/** 6자리 입장 코드(100000~999999). 브라우저 난수로 만든다. */
export function generateRoomCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (value % 900000));
}

/** 규칙은 원문 대신 sha256(meetingId:code) 이름의 entryCodes 문서가 있는지만 본다. */
export async function entryCodeHash(meetingId: string, roomCode: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${meetingId}:${roomCode.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function checkinId(meetingId: string, uid: string): string {
  return `${meetingId}_${uid}`;
}

export function claimedNameId(meetingId: string, voterId: string): string {
  return `${meetingId}_${voterId}`;
}

export function lampId(meetingId: string, badge: number): string {
  return `${meetingId}_${badge}`;
}

async function writeMeeting(meetingId: string, roomCode: string): Promise<void> {
  const now = Date.now();
  const previous = await getDoc(MEETING_DOC);
  const prevData = previous.exists() ? previous.data() : null;
  const batch = writeBatch(db);
  if (typeof prevData?.meetingId === 'string' && typeof prevData.roomCode === 'string' && prevData.roomCode) {
    // 이전 코드는 바로 못 쓰게 한다. 입장 문서는 지우지 않는다.
    batch.delete(doc(db, 'entryCodes', await entryCodeHash(prevData.meetingId, prevData.roomCode)));
  }
  batch.set(doc(db, 'entryCodes', await entryCodeHash(meetingId, roomCode)), { meetingId, createdAt: now });
  batch.set(MEETING_DOC, { roomCode, meetingId, updatedAt: now });
  batch.set(MEETING_PUBLIC_DOC, { meetingId, updatedAt: now });
  await batch.commit();
}

/**
 * 새 모임 시작(입장 초기화). 모임 id 와 입장 코드를 새로 만든다.
 * 예전 입장·번호 문서는 지우지 않고, 모임 id 가 달라 무시된다.
 */
export async function startNewMeeting(): Promise<void> {
  await writeMeeting(newMeetingId(), generateRoomCode());
}

/** 같은 모임에서 입장 코드만 바꾼다. 모임이 없으면 새 모임을 연다. */
export async function rotateRoomCode(currentMeetingId: string): Promise<void> {
  if (!currentMeetingId) {
    await startNewMeeting();
    return;
  }
  await writeMeeting(currentMeetingId, generateRoomCode());
}
