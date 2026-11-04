# 셸 SSO 관리자 로그인

`/admin`의 기본 입장은 2청년회 셸(youth2-space)이다. 투표 앱은 `dcc-poll`에 `signInWithCustomToken`만 호출한다. 셸 구현은 youth2-space PR #61, 셸 쪽 문서 `docs/platform-poll-admin-sso.md`와 같은 계약이다.

오리진이 다르다. 투표는 `https://dcc.leessosso.uk/poll/`와 `https://leessosso.github.io/poll`이고, 셸은 `https://youth2-space.vercel.app`이다. 커스텀 토큰을 브라우저 리다이렉트에 실어 보내지 않는다.

이메일/비밀번호 로그인은 셸이 죽었을 때의 비상 수단이다. 같은 `admin: true` 클레임(또는 양쪽을 같이 바꾼 허용 목록)만 통과한다.

## 엔드포인트

### 1. `GET https://youth2-space.vercel.app/api/platform/poll-admin-sso?return_to=<투표 관리자 URL>`

투표 `/admin`의 기본 로그인 버튼이 여기로 이동한다. `return_to`는 현재 오리진과 Vite `base`로만 만든다. `https`이고 아래 둘 중 하나여야 한다.

- `https://dcc.leessosso.uk/poll/…`
- `https://leessosso.github.io/poll…`

그 외 오리진(로컬 개발 주소 포함)은 쿼리에 넣지 않는다. 셸은 그 경우 `400 invalid_return_to`다.

셸이 로그인되어 있지 않으면 `/login?callbackUrl=…`으로, 비밀번호 변경이 필요하면 `/change-password`로 보낸다. 역할은 Firestore에서 다시 읽는다. 관리자는 셸 역할 **ADMIN**과 **PASTOR**만이다. LEADER(가장), 임원(officerTitle), ATTENDEE는 관리자가 아니다. `members.userId`가 이 사용자와 정확히 하나 연결된 회원(mid)이 아니면 `403 member_not_linked`다. 이 검사는 셸이 코드를 발급하기 전에 하고, 응답은 셸 오리진의 JSON이다.

통과하면 일회용 code를 발급하고 `return_to#code=<code>`로 302한다. `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. code는 쿼리가 아니다.

### 2. `POST https://youth2-space.vercel.app/api/poll/firebase-token`

투표 앱이 프래그먼트에서 code를 읽은 직후 주소창에서 지우고 이 주소로 JSON을 보낸다.

```json
{ "code": "<code>", "audience": "dcc-poll-admin" }
```

쿠키를 보내지 않는다(`credentials: 'omit'`). 셸 세션 쿠키는 `SameSite=Lax`라 투표 오리진의 교차 사이트 요청에 실리지 않는다. **일회용 code 자체가 자격 증명이다.** 발급 때 셸 세션과 관리자 역할을 확인하고, 60초·1회용·발급 사용자에 묶여 있다. 쿠키가 없어도 그 이유만으로 401을 주지 않는다. 쿠키가 우연히 실려 오면 code를 발급한 사용자와 같아야 하고, 다르면 `403 session_mismatch`다.

응답 200: `{ "firebaseToken": "<custom token>" }`.

- uid: `shell_<mid>`
- 클레임: `{ "admin": true, "mid": "<mid>" }`만. `admin`은 boolean `true`다. 문자열 `"true"`는 규칙을 통과하지 못한다.

CORS는 `https://dcc.leessosso.uk`와 `https://leessosso.github.io`만 허용한다. 그 외 Origin은 `403 origin_not_allowed`다.

투표 앱은 토큰으로 `signInWithCustomToken`을 호출하고 `claims.admin === true`일 때만 관리자 화면을 연다. 아니면 세션을 지운다. 규칙은 `request.auth.token.admin == true`만 본다. uid가 `shell_`로 시작해도 따로 막지 않는다.

## 일회용 code

- 256비트 랜덤, base64url 43자. `/^[A-Za-z0-9_-]{43}$/`
- TTL 60초.
- 저장: 셸 Firestore `pollAdminCodes/{sha256(code)}`. 원문은 저장하지 않는다. 투표 앱은 코드를 해석하지 않는다.
- 교환 요청에서 조회되면 성공·실패와 관계없이 즉시 삭제한다. 같은 code로 재시도할 수 없다. 새 로그인이 필요하면 SSO GET부터 다시 한다.

## 오류

교환 응답의 `{ "error": "<코드>" }`를 투표 화면이 한국어로 안내한다.

| 상태 | `error` | 의미 | 투표 화면 |
|------|---------|------|-----------|
| `400` | `invalid_body`, `invalid_audience`, `invalid_code`, `invalid_return_to` | 요청이나 code 형식 오류 | 코드를 버리고 다시 들어오라고 안내 |
| `401` | `unauthenticated` | code를 발급한 셸 사용자가 더 이상 없음 | 셸에서 다시 로그인. 쿠키가 없다는 뜻은 아니다 |
| `403` | `forbidden` | 로그인했지만 ADMIN·PASTOR가 아님 | 권한 없음. 토큰을 저장하지 않음 |
| `403` | `member_not_linked` | 계정이 회원(mid)과 연결되어 있지 않음 | 회원 연결 후 다시 들어오라고 따로 안내 |
| `403` | `session_mismatch` | 실려 온 쿠키 사용자와 code 발급자가 다름 | 다시 로그인 |
| `403` | `origin_not_allowed` | 허용되지 않은 투표 오리진 | 배포된 관리자 주소에서 열라고 안내 |
| `410` | `code_expired_or_used` | 만료됐거나 이미 쓴 code | 다시 시도 버튼 |
| `500` | `not_configured`, `token_mint_failed` | 서비스 계정 또는 Admin SDK 실패 | 셸 장애. 비상 로그인을 연다 |
| 네트워크 | | 셸에 연결하지 못함 | 같은 비상 로그인 안내 |
| 프래그먼트 | | code가 없거나 43자가 아님 | API를 호출하지 않고 형식 오류로 안내 |

## 셸 서버 환경 변수

투표 저장소와 브라우저에 넣지 않는다. 셸(youth2-space) 배포 환경에만 둔다. 없으면 교환은 `500 not_configured`다.

- `POLL_FIREBASE_PROJECT_ID` (기본 `dcc-poll`)
- `POLL_FIREBASE_CLIENT_EMAIL`
- `POLL_FIREBASE_PRIVATE_KEY`

`dcc-poll` 서비스 계정 키다. 커스텀 토큰의 uid `shell_<mid>`는 첫 `signInWithCustomToken` 때 만들어진다. 비상 이메일 계정만 콘솔에서 미리 만들고 `{ "admin": true }`를 넣으면 된다.
