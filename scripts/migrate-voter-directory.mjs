/**
 * voters/{id} 의 이름·활성·생성시각만 voterDirectory/{id} 로 복사한다.
 * externalQrId, memberNo 는 복사하지 않고, 어떤 문서도 지우지 않는다.
 *
 * 기본은 계획만 출력한다. 쓰려면 --apply 가 필요하다.
 * 이 스크립트는 저장소 작업에서 실프로젝트에 실행하지 않는다.
 *
 * firebase-admin 은 앱 의존성이 아니다. 명령을 돌리는 폴더에만 설치한다.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"dcc-poll",...}' node scripts/migrate-voter-directory.mjs
 *   FIREBASE_SERVICE_ACCOUNT_JSON='...' node scripts/migrate-voter-directory.mjs --apply
 */

import { createRequire } from 'node:module';

const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');

if (process.argv.includes('--help')) {
  console.log('사용법: node scripts/migrate-voter-directory.mjs [--apply]');
  console.log('기본값은 dry-run 이다. 공개 이름 문서만 만들고 식별자는 복사하지 않는다.');
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

function publicFields(data) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length > 40) return null;
  return {
    name,
    active: data.active !== false,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
  };
}

function samePublic(current, next) {
  return current
    && current.name === next.name
    && current.active === next.active
    && current.createdAt === next.createdAt
    && Object.keys(current).length === 3;
}

const voters = await db.collection('voters').get();
console.log(apply ? '적용 모드. 공개 이름만 추가합니다.' : 'dry-run. 쓰지 않습니다.');
console.log(`voters ${voters.size}건. externalQrId 와 memberNo 는 복사하지 않고, 기존 문서는 지우지 않습니다.`);

let writes = 0;
let unchanged = 0;
let skipped = 0;

for (const voterDoc of voters.docs) {
  const next = publicFields(voterDoc.data());
  if (!next) {
    skipped += 1;
    console.log(`- voters/${voterDoc.id}: 공개 이름으로 쓸 수 없습니다. 건너뜁니다.`);
    continue;
  }
  const directoryRef = db.collection('voterDirectory').doc(voterDoc.id);
  const currentSnap = await directoryRef.get();
  if (currentSnap.exists && samePublic(currentSnap.data(), next)) {
    unchanged += 1;
    console.log(`- voterDirectory/${voterDoc.id} 가 이미 같습니다. 건너뜁니다.`);
    continue;
  }
  writes += 1;
  console.log(`- voterDirectory/${voterDoc.id} ${currentSnap.exists ? '갱신' : '생성'} ${JSON.stringify(next)}`);
  if (apply) await directoryRef.set(next);
}

console.log(`계획: 쓰기 ${writes}건, 그대로 ${unchanged}건, 건너뜀 ${skipped}건.`);
console.log(apply ? '적용을 마쳤습니다. 삭제는 하지 않았습니다.' : 'dry-run 이므로 아무 문서도 쓰지 않았습니다.');
