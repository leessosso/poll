/**
 * 투표 문서의 results 를 tally/current 로 복사하고, castCount 가 없으면 채운다.
 * 문서를 지우거나 필드를 삭제하지 않는다. checkins, presence, visitors 는 읽지도 않는다.
 *
 * 기본은 계획만 출력한다. 쓰려면 --apply 가 필요하다.
 * 이 스크립트는 저장소 작업에서 실프로젝트에 실행하지 않는다.
 *
 * firebase-admin 은 앱 의존성이 아니다. 명령을 돌리는 폴더에만 설치한다.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"dcc-poll",...}' node scripts/migrate-tally.mjs
 *   FIREBASE_SERVICE_ACCOUNT_JSON='...' node scripts/migrate-tally.mjs --apply
 */

import { createRequire } from 'node:module';

const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');

if (process.argv.includes('--help')) {
  console.log('사용법: node scripts/migrate-tally.mjs [--apply]');
  console.log('기본값은 dry-run 이다. --apply 가 있을 때만 tally 생성과 castCount 설정을 한다.');
  process.exit(0);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON 이 없습니다. 실프로젝트에는 연결하지 않고 끝냅니다.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON 이 JSON 이 아닙니다.');
  process.exit(1);
}

if (serviceAccount.project_id !== 'dcc-poll') {
  console.error(`서비스 계정 project_id 가 dcc-poll 이 아닙니다 (${serviceAccount.project_id ?? '없음'}). 중단합니다.`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('firebase-admin 이 없습니다. 이 명령을 실행하는 폴더에서 npm install firebase-admin 한 뒤 다시 실행하세요.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function sumCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let sum = 0;
  for (const count of Object.values(value)) {
    if (typeof count !== 'number' || !Number.isFinite(count)) return null;
    sum += count;
  }
  return sum;
}

function zeroCounts(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const counts = {};
  for (const option of options) {
    if (typeof option !== 'string' || option.length === 0) return null;
    counts[option] = 0;
  }
  return counts;
}

const polls = await db.collection('polls').get();
console.log(apply ? '적용 모드. 추가 쓰기만 합니다.' : 'dry-run. 쓰지 않습니다.');
console.log(`polls ${polls.size}건. checkins, presence, visitors, results 필드는 지우지 않습니다.`);

let creates = 0;
let castCountWrites = 0;
const openWithResults = [];

for (const pollDoc of polls.docs) {
  const data = pollDoc.data();
  const id = pollDoc.id;
  const resultsSum = sumCounts(data.results);
  const tallyRef = pollDoc.ref.collection('tally').doc('current');
  const tallySnap = await tallyRef.get();

  if (!tallySnap.exists) {
    const counts = resultsSum !== null ? data.results : zeroCounts(data.options);
    if (!counts) {
      console.log(`- polls/${id}: tally 를 만들 정보가 없습니다. 건너뜁니다.`);
    } else {
      console.log(`- polls/${id}/tally/current 생성 ${JSON.stringify({ counts })}`);
      creates += 1;
      if (apply) await tallyRef.create({ counts });
    }
  } else {
    console.log(`- polls/${id}/tally/current 가 이미 있습니다. 덮어쓰지 않습니다.`);
  }

  if (typeof data.castCount !== 'number') {
    const castCount = resultsSum ?? 0;
    console.log(`- polls/${id}.castCount 를 ${castCount} 로 설정`);
    castCountWrites += 1;
    if (apply) await pollDoc.ref.update({ castCount });
  } else {
    console.log(`- polls/${id}.castCount ${data.castCount} 유지`);
  }

  if (data.results !== undefined) {
    console.log(`- polls/${id}.results 는 남겨 둡니다. 상태=${data.status ?? '없음'}`);
    if (data.status === 'waiting' || data.status === 'active') openWithResults.push(id);
  }
}

console.log(`계획: tally 생성 ${creates}건, castCount 설정 ${castCountWrites}건.`);
if (openWithResults.length > 0) {
  console.log('대기 또는 진행 중인데 results 가 남아 있는 문서:');
  for (const id of openWithResults) console.log(`  polls/${id}`);
  console.log('이 필드를 지우지 않아도 목록 쿼리는 됩니다. 다만 로그인한 사용자는 투표 문서를 읽을 때 results 맵을 볼 수 있습니다.');
  console.log('진행 중 투표가 있으면 그 집계가 문서 읽기로 노출되므로, 배포 전에는 진행 중 투표가 없어야 합니다.');
} else {
  console.log('대기·진행 중 투표 중 results 가 남은 문서는 없습니다.');
}
console.log(apply ? '적용을 마쳤습니다. 삭제는 하지 않았습니다.' : 'dry-run 이므로 아무 문서도 쓰지 않았습니다.');
