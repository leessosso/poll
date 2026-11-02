# 등촌교회 투표 시스템

React + Firebase + GitHub Pages 기반 실시간 투표 시스템입니다.

한 공간에 모인 2청년회는 **현장 명단**으로 투표합니다. 모두가 같은 주소로 들어온 뒤, 입장 코드와 본인 이름을 골라 투표 인원이 됩니다. 기존처럼 이름 없이 바로 투표하는 방식과, 장로 선출용 QR 출석 방식도 남아 있습니다.

## 주요 기능

### 투표 방식

| 방식 | 용도 | 입장 | 중복 방지 | 미참여자 목록 |
|------|------|------|-----------|---------------|
| `roster` | 2청년회처럼 한자리에 모이는 투표. 새 투표의 기본값 | 같은 URL + 입장 코드 + 이름 검색 | 이름 1개당 1표 | 실시간 제공 |
| `open` | 이름 없이 바로 참여하는 투표 | 없음 | 그 브라우저의 `localStorage` | 없음 |
| `attendance` | 장로 선출 찬반 투표 | 사람마다 다른 QR 세션 URL | `voterId` 기준 | 실시간 제공 |

현장 명단과 QR 출석 투표는 선택값을 이름 옆에 저장하지 않습니다. 관리자는 누가 투표했는지만 보고, 찬성·반대·기권은 합계로만 봅니다.

### 관리자 기능

- 투표 생성/수정/삭제
- 참여 방식 선택: `현장 명단 (이름 선택)` / `누구나 참여 가능` / `QR 출석 인증 필요`
- 찬반 투표의 기권, 정족수, 가결 기준
- 제한시간 설정. 시간이 길어도 진행 중 투표의 `투표 마감`으로 바로 끝낼 수 있음
- 투표 시작/마감. 마감하거나 제한시간이 끝나면 아직 고르지 않은 사람은 기권으로 합계에 반영
- 결과 공개/비공개 토글
- 헤더의 `진입` / `현재`
  - `진입`: 오늘 투표 화면을 연 브라우저 수. 이름 입장과 무관
  - `현재`: 지금 투표 화면이 열려 있는 탭 수
- 현장 입장 코드 표시와 변경
- 성도 명단을 한 줄에 한 명씩 여러 명 등록. 투표하지 않을 사람을 포함해 전체 명단을 넣어도 됨
- 명단의 `입장함` / `미입장`. 입장 코드와 이름을 고른 사람만 `입장함`
- 투표 시작 후 실시간 참여 현황
  - 시작 전까지 입장한 사람이 이번 투표 인원
  - 미참여자 이름
  - `투표한 사람 / 입장한 사람`
- QR 스캐너 연동 전 테스트용 출석 세션 생성

### 투표자 기능

- 현장 명단: 같은 주소로 들어와 입장 코드를 입력하고, 이름 일부를 검색해 본인 이름을 고름
- `open` 투표: 주소 접속 후 즉시 투표
- `attendance` 투표: QR 출석으로 발급된 세션 주소로 접속 후 투표
- 찬성/반대/기권 선택
- 선택 전 최종 확인 모달
- 남은 시간 카운트다운
- 투표 완료 후 완료 상태 표시

## URL

현재 배포 경로는 `poll`입니다.

| URL | 설명 |
|-----|------|
| `https://leessosso.github.io/poll/` | 투표자 화면 |
| `https://leessosso.github.io/poll/admin` | 관리자 화면 |
| `https://leessosso.github.io/poll/v/{sessionId}` | QR 출석 세션 기반 투표자 화면 |

## 현장 명단 투표 흐름

1. 관리자 화면 명단에 성도 이름을 넣습니다. 그날 오지 않는 사람이 포함되어 있어도 됩니다.
2. `현장 입장`의 코드를 본당이나 식당 화면에 띄웁니다.
3. 성도는 투표 주소로 들어와 코드를 입력하고 본인 이름을 검색해 고릅니다. 이미 고른 이름은 다른 폰에서 다시 고를 수 없습니다.
4. 관리자 화면에서 `현장 명단 (이름 선택)` 투표를 만들고 `투표 시작`을 누릅니다. 그때까지 입장한 이름만 이번 투표 인원으로 고정됩니다.
5. 성도가 찬성/반대/기권을 고르면 참여 현황의 미참여 목록에서 빠집니다. 누가 무엇을 골랐는지는 저장되지 않습니다.
6. 제한시간이 끝나거나 관리자가 `투표 마감`을 누르면, 아직 고르지 않은 사람은 기권으로 집계되고 투표가 닫힙니다.

## 장로 선출 투표 흐름

자세한 운영 흐름은 [`docs/elder-vote.md`](docs/elder-vote.md)를 참고하세요.

요약:

1. 관리자 화면에서 성도 명단 또는 테스트 성도를 등록합니다.
2. QR 출석 스캔 또는 테스트용 `출석 세션 생성`으로 `attendanceSessions`를 만듭니다.
3. 관리자 화면에서 `QR 출석 인증 필요` 투표를 생성합니다.
4. 투표를 시작하면 출석 세션이 있는 성도들이 미참여 목록에 들어갑니다.
5. 성도가 찬성/반대/기권을 선택하면 미참여 목록에서 사라집니다.
6. 제한시간이 끝나거나 관리자가 마감하면 미참여자는 자동 기권 처리됩니다.

## 데이터 구조

### Firestore

| 컬렉션 | 역할 |
|--------|------|
| `polls` | 투표 정의, 상태, 공개 여부, 선택지가 없는 참여 총원 `castCount` |
| `polls/{pollId}/tally/current` | 선택지별 집계. 마감 후 공개이거나 관리자만 읽음 |
| `polls/{pollId}/voteGuards/{uid}` | 한 계정의 1표 잠금. 선택값은 없고 클라이언트는 읽지 않음 |
| `polls/{pollId}/participation` | 현장 명단·QR 출석 투표의 참여 여부. 이름과 완료 여부만 있고 선택값은 없음 |
| `voters` | 고를 수 있는 성도 이름. 명단에 있어도 입장하기 전에는 투표 인원이 아님 |
| `checkins/{voterId}` | 입장 코드로 이름을 고른 기록. 선택값은 없음 |
| `meeting/current` | 화면에 띄우는 입장 코드 |
| `attendanceSessions` | QR 출석으로 발급된 당일 투표 세션 |
| `attendanceRawEvents` | QR 스캔 원본 로그 |
| `attendanceOutbox` | 외부 출석 서버 전달 대기 큐 |

### Realtime Database

| 경로 | 역할 |
|------|------|
| `presence/{sessionId}` | 헤더 `현재`. 투표 화면 탭이 열려 있는지 |
| `visitors/{YYYY-MM-DD}/{clientId}` | 헤더 `진입`. 오늘 투표 화면을 연 브라우저 |

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm run lint
npm run build
```

## Firebase 환경 변수

`.env.example`을 `.env`로 복사 후 Firebase 설정 값을 입력합니다.

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
```

관리자 비밀번호 변수는 없다. 비밀번호를 번들에 넣지 않는다.

## 보안 규칙과 관리자 로그인

Firestore 규칙과 Realtime Database 규칙은 저장소의 `firestore.rules`, `database.rules.json`에 있다. `firebase.json`이 둘을 가리킨다. `npm run deploy`는 GitHub Pages만 갱신하고 규칙은 배포하지 않는다.

`/admin`의 기본 버튼은 2청년회 셸로 보낸다. 셸이 ADMIN 또는 PASTOR이고 회원(mid)이 하나 연결되어 있으면, 60초 일회용 코드를 주소 프래그먼트로 돌려준다. 투표 앱은 그 코드만으로 `https://youth2-space.vercel.app/api/poll/firebase-token`에 교환하고 `signInWithCustomToken`을 호출한다. 쿠키는 보내지 않는다. uid는 `shell_<mid>`이고 클레임은 `{ "admin": true, "mid" }`이다. 규칙은 `admin == true`만 본다. 규격은 [`docs/security-shell-admin.md`](docs/security-shell-admin.md)에 있다.

이메일/비밀번호는 셸이 죽었을 때의 비상 로그인이다. 화면에서는 "비상 로그인"으로만 연다. 같은 관리자 클레임이 있어야 한다.

규칙 테스트:

```bash
npm run test:rules
```

Java가 필요하다. Firestore/RTDB 에뮬레이터만 띄우며, `dcc-poll` 실데이터에는 연결하지 않는다.

### 콘솔에서 직접 할 일

이 저장소를 받은 에이전트나 CI가 하면 안 된다. 프로젝트 소유자가 배포를 승인할 때 아래 순서로 한다.

1. 셸(youth2-space) 서버 환경에 `dcc-poll` 서비스 계정을 넣는다. 이 저장소에는 넣지 않는다. 없으면 코드 교환이 `500`이다.
   - `POLL_FIREBASE_PROJECT_ID` (비우면 `dcc-poll`)
   - `POLL_FIREBASE_CLIENT_EMAIL`
   - `POLL_FIREBASE_PRIVATE_KEY`
   셸을 배포한 뒤, 투표 관리자는 셸 역할 ADMIN 또는 PASTOR이고 `members.userId`로 회원이 정확히 하나 연결돼 있어야 한다.
2. Authentication에서 Email/Password(비상 로그인)와 Anonymous(투표자)를 켠다.
3. 비상 로그인용 이메일/비밀번호 계정을 한 명 만든다. 셸이 정상일 때는 이 계정을 쓰지 않는다.
4. 그 사용자에게 커스텀 클레임 `{ "admin": true }`를 넣는다. 서비스 계정은 로컬에서만 쓰고 저장소에 커밋하지 않는다. 셸 계정 `shell_<mid>`는 첫 커스텀 토큰 로그인 때 생기므로 미리 만들지 않는다.

```bash
# FIREBASE_SERVICE_ACCOUNT_JSON, ADMIN_EMAIL 을 환경에만 두고 실행
node --input-type=module -e '
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const user = await getAuth().getUserByEmail(process.env.ADMIN_EMAIL);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log(user.uid);
'
```

`firebase-admin`은 이 앱 의존성이 아니다. 위 명령을 돌리는 폴더에만 설치한다. 클레임을 넣은 뒤에는 그 계정으로 다시 로그인해야 토큰에 반영된다.

클레임을 쓰기 어려우면 `firestore.rules`의 `isAllowlistedAdmin()`과 `src/lib/admin-auth.ts`의 `ALLOWLISTED_ADMIN_EMAILS`를 같은 이메일로 같이 바꾼다. 둘 중 하나만 바꾸면 화면과 규칙이 어긋난다.

5. Authentication 승인 도메인에 `leessosso.github.io`와 `dcc.leessosso.uk`를 넣는다.
6. 아래 데이터 이전을 Admin SDK나 콘솔로 끝낸다. 규칙이 먼저 올라가면 `results`가 남은 투표가 하나라도 있을 때 투표 목록 쿼리 전체가 실패한다.
7. 규칙을 배포한다. 사이트 배포와 별개다.

```bash
npx firebase deploy --only firestore:rules,database --project dcc-poll
```

8. `.env`에 위의 Firebase 웹 설정만 넣고 `npm run deploy`로 사이트를 배포한다. `VITE_ADMIN_PASSWORD`는 넣지 않는다. 셸 환경 변수를 사이트 `.env`에 넣지 않는다. 사이트보다 셸이 먼저 떠 있어야 관리자 버튼이 동작한다.

### 데이터 이전

실데이터에는 손대지 않은 상태의 절차다. 실행은 소유자만 한다.

각 `polls/{id}`에 대해:

- `results` 맵을 `polls/{id}/tally/current` 문서 `{ counts: <그 맵> }`으로 복사한다. 키가 없으면 선택지별 `0`으로 만든다.
- `castCount`가 없으면 `results` 값의 합으로 설정한다.
- 투표 문서에서 `results` 필드를 삭제한다.

`checkins`는 `authUid`가 없다. 규칙 배포 전에 체크인 문서를 지운다. 현장에서는 입장 코드와 이름을 다시 고른다. 이미 끝난 투표의 `participation`은 그대로 둔다.

`presence`와 `visitors`는 접속 흔적이라 지워도 된다. 예전 방문 기록은 `authUid`가 없어 새 앱이 갱신하지 못할 수 있다.

### 아직 약한 부분

- 투표자 계정은 익명이다. 브라우저를 새로 만들면 익명 uid도 새로 생긴다. `open` 투표는 그 uid마다 한 표라서, 계정을 반복 발급하면 표를 더 넣을 수 있다.
- 현장 명단은 먼저 이름을 잡은 uid만 그 이름으로 투표한다. 입장 코드는 `meeting/current`를 읽어야 검사가 가능해서 인증된 사용자에게 공개다. 코드를 모르는 사람도 비어 있는 이름을 잡을 수 있다.
- `checkins`의 `claimToken`과 `authUid`는 같은 문서를 목록으로 읽는다. 토큰만으로는 투표할 수 없고, 그 체크인을 만든 uid여야 한다.
- 출석 세션 id를 아는 사람은 그 세션으로 한 표 넣을 수 있다. 목록 조회는 관리자만 된다.
- 익명 사용자는 `presence`와 오늘 `visitors`를 읽는다. 접속 시각과 클라이언트 id이며 선택값은 없다.
- 관리자 계정은 규칙을 통과하는 쓰기를 모두 할 수 있다. 집계를 직접 고치는 것도 여기 포함된다.
- 셸이 `mid`로 유권자를 묶기 전에는 위 익명 한계가 남는다. 교체 규격은 [`docs/security-shell-admin.md`](docs/security-shell-admin.md)에 있다.

선택지별 숫자는 `polls/{id}/tally/current`에만 있다. 투표가 `closed`이고 `showResults`가 켜져 있거나, 관리자일 때만 읽는다. 진행 중에는 `showResults`를 켜도 투표자 화면은 집계를 요청하지 않는다. 정족수 막대는 선택지가 없는 `castCount`만 본다.

## 푸시와 배포

소스 저장과 실제 사이트 반영은 따로입니다. `main`에 푸시해도 [투표 화면](https://leessosso.github.io/poll/)과 [관리자 화면](https://leessosso.github.io/poll/admin)은 바뀌지 않습니다. 사이트에 반영하려면 푸시한 뒤 `npm run deploy`를 실행합니다.

프로젝트 폴더에서 아래 순서대로 실행합니다.

```bash
git add .
git commit -m "변경 내용을 한 줄로 적습니다"
git push origin main
npm run deploy
```

`npm run deploy`는 앱을 빌드한 다음, 그 결과를 GitHub Pages용 `gh-pages` 브랜치에 올립니다. 배포가 끝나면 1–2분 정도 기다린 뒤 브라우저에서 새로고침합니다. 이전 화면이 보이면 캐시를 무시하고 새로고침합니다.

`main` 푸시만 하면 코드 저장소만 갱신됩니다. 페이지 배포는 자동으로 이어지지 않습니다.

## 현재 구현 상태와 주의사항

- 장로 선출 투표 흐름은 현재 클라이언트 + Firestore 기반으로 동작 확인이 가능하게 구현되어 있습니다.
- 보안 규칙과 관리자 로그인은 위 "보안 규칙과 관리자 로그인"을 따른다. 투표 쓰기는 아직 클라이언트에 있다. Cloud Functions로 옮기는 일은 셸 로그인 이후다.
- 관리자 비밀번호는 번들에 넣지 않는다. `/admin`은 2청년회 셸 SSO가 기본이고, 이메일/비밀번호는 비상 로그인이다. 둘 다 `admin` 커스텀 클레임이 있어야 한다.
- QR 출석 스캐너의 실제 연동 방식은 아직 확정 전입니다. 한자리에 모이는 투표는 `현장 명단`을 쓰고, QR 세션은 관리자 화면에서 테스트로 만들 수 있습니다.
- 헤더의 진입·현재 인원은 브라우저·탭 수입니다. 입장 코드로 이름을 고른 인원은 명단의 `입장함`과 투표 시작 후 참여 현황에서 확인합니다.
