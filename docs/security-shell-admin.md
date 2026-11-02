# 셸 SSO로 관리자 로그인을 바꿀 때

지금은 `/admin`이 Firebase Email/Password로 로그인하고, 규칙은 `request.auth.token.admin == true`만 관리자로 본다. 2청년회 셸(youth2-space)이 회원 `mid`를 갖게 되면 아래 교환으로 그 로그인을 대체한다. 투표 앱은 `dcc-poll` 프로젝트에 `signInWithCustomToken`만 호출한다.

오리진이 다르다. 투표는 `https://dcc.leessosso.uk/poll/`와 `https://leessosso.github.io/poll`이고, 셸은 그 밖의 오리진이다. 커스텀 토큰을 브라우저 리다이렉트에 실어 보내지 않는다.

## 셸이 제공할 것

서버 엔드포인트 하나. 예: `POST https://<shell-origin>/api/poll/firebase-token`.

1. 요청의 셸 세션 쿠키로 로그인 사용자를 확인한다.
2. 그 사용자의 역할이 관리자일 때만 진행한다. 아니면 `403`.
3. 일회용 `code`를 검사한다. 없거나, 이미 썼거나, 만료됐거나, audience가 `dcc-poll-admin`이 아니면 거절한다.
4. 통과하면 Firebase Admin SDK로 `dcc-poll` 커스텀 토큰을 만든다.

서비스 계정 키는 셸 서버 환경 변수에만 둔다. 투표 저장소, 브라우저, GitHub Pages에 넣지 않는다.

클레임은 이 두 개만 쓴다.

```json
{ "admin": true, "mid": "<셸 회원 id>" }
```

`admin`은 반드시 boolean `true`다. 문자열 `"true"`는 규칙을 통과하지 못한다. 유권자용 토큰을 나중에 만들 때도 `admin: true`를 넣지 않는다. 선택값과 `mid`를 같은 Firestore 문서에 넣지 않는다.

Firebase 커스텀 토큰 수명은 최대 1시간이다. 셸은 교환 직전에 발급한다.

## 일회용 코드

셸이 코드를 만든다.

- 값: 128비트 이상 랜덤. URL에 넣어도 되는 인코딩.
- TTL: 60초.
- 1회용. 교환에 성공하거나 실패로 소진되면 즉시 삭제한다.
- 묶음: `mid`, 발급 시각, audience `dcc-poll-admin`.
- 저장: 셸 서버만 읽는다. 투표 앱은 코드를 해석하지 않는다.

## 흐름

1. 투표 `/admin`에 세션이 없으면 셸 로그인으로 보낸다. `return_to`는 투표 관리자 URL이다.
2. 셸은 관리자 역할을 확인한 뒤 코드를 발급하고 투표 오리진으로 돌려보낸다. 코드는 쿼리가 아니라 프래그먼트에 둔다. 예: `https://dcc.leessosso.uk/poll/admin#code=<code>`. 서버 로그와 Referer에 남지 않게 한다.
3. 투표 앱은 프래그먼트에서 `code`를 읽고 주소창에서 바로 지운다.
4. `POST /api/poll/firebase-token`에 `{ "code": "<code>", "audience": "dcc-poll-admin" }`를 보낸다. 자격 증명은 셸 세션 쿠키(`credentials: 'include'`)다. 셸 CORS는 투표 오리진 두 개만 허용한다.
5. 응답 `{ "firebaseToken": "<custom token>" }`를 받으면 `signInWithCustomToken(auth, firebaseToken)`을 호출한다.
6. `getIdTokenResult()`의 `claims.admin === true`이면 지금 관리자 화면을 연다. 규칙은 그대로다.

## 오류

| 상태 | 의미 | 투표 화면 |
|------|------|-----------|
| `401` | 셸 세션 없음 | 셸 로그인으로 다시 보낸다 |
| `403` | 로그인했지만 관리자 아님 | 권한 없음. 토큰을 저장하지 않는다 |
| `400` | audience 불일치, code 형식 오류 | 코드를 버리고 다시 보낸다 |
| `410` | 만료됐거나 이미 쓴 code | 코드를 버리고 다시 보낸다 |
| `500` | 서비스 계정 또는 Admin SDK 실패 | 로그인 실패. 키를 클라이언트에 내리지 않는다 |

네트워크가 재시도해도 같은 `code`는 두 번 쓰지 못한다. 새 코드가 필요하면 1번부터 다시 한다.
