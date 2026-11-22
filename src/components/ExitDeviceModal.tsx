interface ExitDeviceModalProps {
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ExitDeviceModal({ loading, onConfirm, onCancel }: ExitDeviceModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-device-title"
        className="bg-surface rounded-2xl p-6 w-full max-w-sm text-center shadow-xl border border-border"
      >
        <h2 id="exit-device-title" className="text-xl font-bold text-gray-800 mb-3">
          이 기기에서 퇴장할까요?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          다른 기기로 이미 입장했다면 여기서 퇴장하세요. 이 기기의 번호는 해제되고, 필요하면 입장 코드로 다시 들어올 수 있습니다.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
          >
            {loading ? '퇴장 중...' : '퇴장'}
          </button>
        </div>
      </div>
    </div>
  );
}
