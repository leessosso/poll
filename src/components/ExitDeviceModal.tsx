interface ExitDeviceModalProps {
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ExitDeviceModal({ loading, error, onConfirm, onCancel }: ExitDeviceModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-device-title"
        className="bg-surface rounded-2xl p-6 w-full max-w-sm text-center shadow-xl border border-border"
      >
        <h2 id="exit-device-title" className="text-xl font-bold text-gray-800 mb-3">
          혹시 중복 입장하셨나요?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          실수로 두 기기에서 입장하셨다면 하나는 퇴장해 주세요. 퇴장해도 입장 코드로 다시 들어올 수 있어요.
        </p>
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
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
            {loading ? '퇴장 중...' : '이 기기에서 퇴장'}
          </button>
        </div>
      </div>
    </div>
  );
}
