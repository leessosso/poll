import { doc, setDoc, type WriteBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { BoardMode } from './board-mode';

export type { BoardMode } from './board-mode';
export { isBoardStandby } from './board-mode';

/** 현황판 대기/결과 모드. 로그인 사용자는 읽고 관리자만 쓴다. */
export const BOARD_STATE_DOC = doc(db, 'boardState', 'current');

export function applyBoardMode(batch: WriteBatch, mode: BoardMode, updatedAt = Date.now()): void {
  batch.set(BOARD_STATE_DOC, { mode, updatedAt });
}

export async function setBoardMode(mode: BoardMode): Promise<void> {
  await setDoc(BOARD_STATE_DOC, { mode, updatedAt: Date.now() });
}
