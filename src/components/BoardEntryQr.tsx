import { useState } from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useMeetingCode } from '../hooks/useMeetingCode';
import { voterEntryUrl } from '../lib/voter-entry-url';
import BoardEntryQrModal from './BoardEntryQrModal';

/** 현황판 헤더의 작은 버튼과 투표 입장 QR 모달. 입장 코드는 관리자 세션에서만 읽는다. */
export default function BoardEntryQr() {
  const [open, setOpen] = useState(false);
  const { ready, isAdmin } = useAdminAuth();
  const { roomCode, loading: codeLoading } = useMeetingCode(ready && isAdmin);
  const entryUrl = voterEntryUrl(window.location.origin, import.meta.env.BASE_URL);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      >
        QR 입장
      </button>
      {open && (
        <BoardEntryQrModal
          entryUrl={entryUrl}
          roomCode={roomCode}
          showCode={isAdmin}
          codeLoading={codeLoading}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
