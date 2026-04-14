# 2청년회 총회 투표 시스템

실시간 익명 투표 시스템 (React + Firebase + GitHub Pages)

## 시작 전 준비

### 1. Firebase 프로젝트 생성

1. [Firebase 콘솔](https://console.firebase.google.com) 접속 후 새 프로젝트 생성
2. **Firestore Database** 활성화 → 테스트 모드로 시작
3. **Realtime Database** 활성화 → 테스트 모드로 시작
4. **프로젝트 설정 > 내 앱** 에서 웹 앱 등록 후 설정 값 복사

### 2. 환경 변수 설정

`.env.example`을 `.env`로 복사 후 Firebase 설정 값 입력:

```bash
cp .env.example .env
```

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_ADMIN_PASSWORD=원하는비밀번호
```

### 3. package.json 수정

`package.json`의 `homepage` 값을 실제 GitHub 유저명으로 변경:

```json
"homepage": "https://your-github-username.github.io/church-vote"
```

## 로컬 실행

```bash
npm install
npm run dev
```

## GitHub Pages 배포

```bash
npm run deploy
```

GitHub 레포지토리 설정에서 **Pages > Source: gh-pages 브랜치** 로 설정하면 완료.

## 사용 방법

| URL | 설명 |
|-----|------|
| `https://<username>.github.io/church-vote/` | 투표자 화면 (QR코드로 공유) |
| `https://<username>.github.io/church-vote/#/admin` | 관리자 화면 |

### 관리자 기능
- 투표 주제 미리 만들어두기 (찬반 / 다중선택)
- 총회 순서에 맞게 투표 활성화 → 마감
- 실시간 접속자 수 확인
- 결과 공개/비공개 토글
- 투표 삭제

### 투표자 기능
- URL 접속만으로 즉시 참여 (로그인 불필요)
- 1기기 1투표 (브라우저 localStorage 기반)
- 완료된 투표 결과 열람 가능

## Firebase Firestore 보안 규칙 (배포 전 설정 권장)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /polls/{pollId} {
      allow read: if true;
      allow create, delete, update: if false; // 클라이언트 직접 수정 제한 (선택)
    }
  }
}
```

> 간단한 사용 목적이므로 테스트 모드(전체 허용)로도 충분합니다.
