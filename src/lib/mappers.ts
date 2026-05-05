import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Poll } from '../types';

export function mapPoll(doc: QueryDocumentSnapshot<DocumentData>): Poll {
  return { id: doc.id, ...doc.data() } as Poll;
}
