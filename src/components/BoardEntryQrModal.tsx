import { useEffect, useId } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface BoardEntryQrModalProps {
  entryUrl: string;
  roomCode: string;
  showCode: boolean;
  codeLoading?: boolean;
  onClose: () => void;
}

/** 투표 입장 QR과(관리자일 때) 입장 코드를 보여주는 모달. 코드는 QR 주소에 넣지 않는다. */
export default function BoardEntryQrModal({
  entryUrl,
  roomCode,
  showCode,
  codeLoading = false,
  onClose,
}: BoardEntryQrModalProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const codeLabel = codeLoading ? '------' : roomCode || '없음';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[min(94vw,86rem)] overflow-hidden rounded-3xl border border-border bg-surface px-8 py-10 shadow-xl sm:px-12"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-center text-[clamp(2rem,3.2vw,3.5rem)] font-bold text-gray-900">
          투표 입장
        </h2>
        <p className="mt-3 text-center text-[clamp(1rem,1.6vw,1.5rem)] text-gray-500">
          휴대폰 카메라로 QR을 찍거나, 아래 주소로 들어와 주세요.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-10 xl:flex-row xl:gap-16">
          <div className="flex flex-col items-center">
            {entryUrl ? (
              <div className={`rounded-2xl bg-white p-3 ${showCode ? 'w-[min(42vmin,24rem)]' : 'w-[min(52vmin,28rem)]'}`}>
                <QRCodeSVG
                  value={entryUrl}
                  size={512}
                  level="M"
                  marginSize={4}
                  title="투표 입장 주소"
                  bgColor="#FFFFFF"
                  fgColor="#0F172A"
                  className="h-auto w-full"
                />
              </div>
            ) : (
              <div className="grid h-[min(52vmin,28rem)] w-[min(52vmin,28rem)] place-items-center text-gray-400">
                주소를 준비하는 중...
              </div>
            )}
            <p className={`mt-4 break-all text-center text-[clamp(1rem,1.5vw,1.35rem)] text-gray-600 ${showCode ? 'max-w-[min(42vmin,24rem)]' : 'max-w-[min(52vmin,28rem)]'}`}>
              {entryUrl || ' '}
            </p>
          </div>

          {showCode && (
            <div className="text-center">
              <p className="text-[clamp(1rem,1.5vw,1.5rem)] font-medium text-gray-500">입장 코드</p>
              <p className="mt-2 max-w-full font-bold tabular-nums leading-none tracking-[0.12em] text-primary text-[clamp(3.5rem,6.5vw,6.5rem)]">
                {codeLabel}
              </p>
            </div>
          )}
        </div>

        {!showCode && (
          <p className="mt-8 text-center text-sm text-gray-400">
            입장 코드는 관리자로 로그인한 현황판에서만 표시됩니다.
          </p>
        )}

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border px-8 py-3 text-lg font-semibold text-gray-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
