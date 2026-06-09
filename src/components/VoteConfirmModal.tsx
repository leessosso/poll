interface VoteConfirmModalProps {
  choice: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function VoteConfirmModal({
  choice,
  loading,
  onConfirm,
  onCancel,
}: VoteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-xl">
        <p className="text-gray-500 font-medium mb-2">선택 확인</p>
        <h2 className="text-3xl font-bold text-gray-900 mb-6">{choice}</h2>
        <p className="text-lg text-gray-700 mb-6">이 선택으로 투표하시겠습니까?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="py-4 rounded-2xl border border-gray-300 text-gray-700 text-lg font-semibold disabled:opacity-50"
          >
            다시 선택
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="py-4 rounded-2xl bg-indigo-600 text-white text-lg font-semibold disabled:opacity-50"
          >
            {loading ? '처리 중...' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
