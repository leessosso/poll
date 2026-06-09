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
    ...data,
    type,
    options,
    status: data.status ?? 'waiting',
    createdAt: data.createdAt ?? 0,
    results: data.results ?? {},
    showResults: data.showResults ?? false,
    eligibilityMode: data.eligibilityMode ?? 'open',
    allowAbstain,
  } as Poll;
}
