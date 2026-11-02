import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Poll } from '../types';

export function mapPoll(doc: QueryDocumentSnapshot<DocumentData>): Poll {
  const data = doc.data();
  const type = data.type ?? 'yesno';
  const allowAbstain = data.allowAbstain ?? false;
  const options =
    data.options ??
    (type === 'yesno' ? (allowAbstain ? ['찬성', '반대', '기권'] : ['찬성', '반대']) : []);

  return {
    id: doc.id,
    title: data.title ?? '',
    type,
    options,
    status: data.status ?? 'waiting',
    createdAt: data.createdAt ?? 0,
    // 레거시 results 필드는 투표 문서에 남아 있어도 화면에 올리지 않는다.
    results: {},
    castCount: typeof data.castCount === 'number' ? data.castCount : 0,
    showResults: data.showResults ?? false,
    eligibilityMode: data.eligibilityMode ?? 'open',
    allowAbstain,
    eventId: data.eventId,
    durationSeconds: data.durationSeconds,
    startedAt: data.startedAt,
    endsAt: data.endsAt,
    closedAt: data.closedAt,
    quorumTarget: typeof data.quorumTarget === 'number' ? data.quorumTarget : undefined,
    passRatio: typeof data.passRatio === 'number' ? data.passRatio : undefined,
  };
}
