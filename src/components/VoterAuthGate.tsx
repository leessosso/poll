interface VoterAuthGateProps {
  loading: boolean;
  error: string | null;
}

export default function VoterAuthGate({ loading, error }: VoterAuthGateProps) {
  return (
    <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
      <div className="text-5xl mb-4">{loading ? '⏳' : '📱'}</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-3">
        {loading ? '출석 정보를 확인 중입니다' : 'QR 출석 확인이 필요합니다'}
      </h2>
      <p className="text-gray-500 leading-relaxed">
        {error ??
          '장로 선출 투표는 출석 확인이 완료된 성도님만 참여할 수 있습니다. 안내 데스크에서 QR 출석을 먼저 확인해 주세요.'}
      </p>
    </div>
  );
}
