# 등촌교회 투표 시스템

React + Firebase + GitHub Pages 기반 실시간 투표 시스템입니다.

기존 2청년회용 **누구나 참여 가능한 실시간 투표**를 유지하면서, 장로 선출용 **QR 출석 인증 기반 찬반 투표** 기능을 추가했습니다.

## 주요 기능

### 투표 방식

| 방식 | 용도 | 인증 | 중복 방지 | 미참여자 목록 |
|------|------|------|-----------|---------------|
| `open` | 2청년회 등 간단한 실시간 투표 | 없음 | 브라우저 `localStorage` | 없음 |
| `attendance` | 장로 선출 찬반 투표 | QR 출석 세션 | `voterId` 기준 | 실시간 제공 |

### 관리자 기능

- 투표 생성/수정/삭제
- 참여 방식 선택: `누구나 참여 가능` / `QR 출석 인증 필요`
- 찬반 투표에 `기권` 선택지 포함 가능
- 출석 인증 투표의 제한시간 설정
- 투표 시작/마감
- 결과 공개/비공개 토글
- 실시간 접속자/방문자 수 확인
- 장로 선출 투표의 실시간 참여 현황 확인
  - 미참여자 이름 목록
  - 참여 완료 인원
  - 전체 참여율
- 실제 QR 스캐너 연동 전 테스트용 성도/출석 세션 생성

### 투표자 기능

- `open` 투표: 기존처럼 URL 접속 후 즉시 투표
- `attendance` 투표: QR 출석 확인으로 발급된 세션 URL 접속 후 투표
- 찬성/반대/기권 선택
- 선택 전 최종 확인 모달
- 남은 시간 카운트다운
- 투표 완료 후 완료 상태 표시

## URL

현재 배포 경로는 `poll`입니다.

| URL | 설명 |
|-----|------|
| `https://leessosso.github.io/poll/` | 투표자 화면 |
| `https://leessosso.github.io/poll/#/admin` | 관리자 화면 |
| `https://leessosso.github.io/poll/#/v/{sessionId}` | QR 출석 세션 기반 투표자 화면 |

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
| `polls` | 투표 정의, 상태, 결과 집계 |
| `polls/{pollId}/participation` | 출석 인증 투표의 참여 여부. 선택값은 저장하지 않음 |
| `polls/{pollId}/ballots` | 익명 투표지. 선택값만 저장하고 `voterId`는 저장하지 않음 |
| `voters` | 출석 인증 투표 대상 성도 |
| `attendanceSessions` | QR 출석 확인으로 발급된 당일 투표 세션 |
| `attendanceRawEvents` | QR 스캔 원본 로그 |
| `attendanceOutbox` | 외부 출석 서버 전달 대기 큐 |

### Realtime Database

| 경로 | 역할 |
|------|------|
| `presence/{sessionId}` | 현재 접속자 |
| `visitors/{YYYY-MM-DD}/{clientId}` | KST 기준 일별 방문자 |

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
VITE_ADMIN_PASSWORD=원하는비밀번호
```

## 배포

현재 `vite.config.ts`의 `base`는 `/poll/`입니다.

```bash
npm run deploy
```

또는 GitHub Actions를 추가해 `main` push 시 자동 배포할 수 있습니다.

## 현재 구현 상태와 주의사항

- 장로 선출 투표 흐름은 현재 클라이언트 + Firestore 기반으로 동작 확인이 가능하게 구현되어 있습니다.
- 실제 운영 전에는 `castVote`, `startPoll`, `finalizePoll`, `checkInFromQr` 성격의 로직을 Cloud Functions로 옮기고 Firestore 보안 규칙을 강화해야 합니다.
- 관리자 비밀번호는 현재 `VITE_ADMIN_PASSWORD` 기반이라 프론트 번들에 포함됩니다. 실제 선거 운영 전에는 Firebase Auth + 관리자 권한으로 이전하는 것이 좋습니다.
- QR 출석 스캐너의 실제 연동 방식은 아직 확정 전입니다. 현재는 관리자 화면에서 테스트용 출석 세션을 만들 수 있습니다.
