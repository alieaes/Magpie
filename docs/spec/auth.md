# 스펙: 로그인과 닉네임

설계: [261006-07-login.md](../design/261006-07-login.md)

## Google 로그인

- Google OIDC, 인가 코드 + PKCE(S256) + state + nonce. 요청 범위는 **`openid` 하나**. 이메일·이름·사진은 받지 않는다.
- 유저는 ID 토큰의 `sub`로만 구분한다(`users.google_sub`). 처음 로그인하면 닉네임 없이(`NULL`) 만든다.
- `.env`의 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`이 둘 다 있어야 로그인이 열린다. 없으면 서버는 뜨고 로그인만 막힌다.
- 돌아올 주소: `<SITE_URL>/auth/google/callback`. Google Cloud Console에 등록한 주소와 똑같아야 한다.
  - 개발 `http://localhost:5480/auth/google/callback`, 운영 `https://magpie.aviaryhub.org/auth/google/callback`
- Google 설정(discovery)은 첫 로그인 때 받아 기억한다. 받기에 실패하면 다음 로그인 때 다시 받는다.

| 요청 | 하는 일 |
|---|---|
| `GET /auth/google?returnTo=` | 임시 값을 10분짜리 쿠키에 두고 Google로 보낸다(`prompt=select_account`). 로그인 설정이 없으면 `/?login=unavailable` |
| `GET /auth/google/callback` | 임시 값 확인 → 토큰 교환·ID 토큰 검증 → 유저 찾기/만들기 → 세션 쿠키 → `returnTo`. 실패하면 `/?login=failed` |
| `POST /auth/logout` | 세션 줄과 쿠키를 지운다. `204` |

- `returnTo`는 `/`로 시작하는 우리 사이트 경로만 받는다(`//`, `/\`, `/auth/`로 시작하면 `/`).

## 세션

| 항목 | 값 |
|---|---|
| 쿠키 | 개발 `magpie_session`, https `__Host-magpie_session`. HttpOnly, SameSite=Lax, Path=/, https면 Secure |
| 값 | 무작위 32바이트(base64url). DB(`sessions.id_hash`)에는 SHA-256만 |
| 기간 | 30일. 남은 기간이 15일 아래일 때 요청이 오면 30일로 다시 늘리고 쿠키도 다시 준다 |
| 확인 | `/api/*` 요청마다 미들웨어가 확인해 `c.get('user')`(`{ id, nickname, isAdmin }`)를 채운다. 쿠키가 없으면 DB를 보지 않는다. 없는·만료 세션이면 쿠키를 지운다 |
| 정리 | 만료 세션은 서버 시작 때와 하루에 한 번 지운다 |

유저 줄을 지우면 세션도 같이 지워진다(외래 키 `ON DELETE CASCADE`).

## 요청 위조 방지

`/api/*`, `/auth/*`의 GET·HEAD·OPTIONS 외 요청은 `Origin` 헤더가 `SITE_URL`의 origin과 같아야 한다. 아니면 `403 BAD_ORIGIN`.

## 닉네임 (`shared/src/nickname.ts`)

- 앞뒤 공백을 지우고 2~12자. 한글(완성형 가-힣, 자모 ㄱ-ㅎ ㅏ-ㅣ)·영문·숫자·밑줄만. 공백 불가.
- 쓸 수 없는 이름: `관리자`, `운영자`, `운영진`, `admin`, `magpie`가 들어간 이름, 그리고 `까치`, `gm`, `system`, `시스템` 그대로(대소문자 무시).
- 중복: DB 유일 조건(`uq_users_nickname`). 정렬 규칙이 대소문자를 구분하지 않아서 `Sky`와 `sky`는 같은 이름이다.
- 바꾸면 그 서버 프로세스의 랭킹 캐시를 비운다(지난 기록의 이름도 같이 바뀐다).

| 요청 | 응답 |
|---|---|
| `GET /api/me` | `{ user: { nickname, isAdmin } \| null, loginAvailable }`. 관리자는 [admin.md](./admin.md) |
| `PUT /api/me/nickname` `{ nickname }` | `200 { nickname }`. 비로그인 `401`, 규칙 위반 `400 NICKNAME_LENGTH / NICKNAME_CHARS / NICKNAME_RESERVED`, 중복 `409 NICKNAME_TAKEN` |

## 화면

- 상단 바 "로그인": `loginAvailable`이면 켜지고, 누르면 지금 주소로 돌아오는 Google 로그인으로 간다.
- 로그인 후: 아바타(닉네임 첫 글자, 닉네임 전이면 `?`) + 닉네임(전이면 청록 "닉네임 정하기") → 메뉴: 닉네임 정하기/변경, 로그아웃, (구분선) 탈퇴(빨강).
- 닉네임이 없으면 앱이 뜰 때 "닉네임을 정해 주세요" 창이 열린다("나중에"로 닫을 수 있음). 규칙 위반은 입력하는 대로 알려주고(막 치기 시작한 짧은 입력은 빼고), 중복은 저장할 때 서버 문구로 알려준다.
- `?login=failed` / `?login=unavailable`로 돌아오면, 또는 탈퇴 뒤 `?account=deleted`로 오면 상단에 5초 안내를 띄우고 주소에서 지운다.
- 로그인·로그아웃하면 랭킹 패널·페이지와 게임 카드 요약을 다시 불러온다(내 순위·내 최고).

## 탈퇴

설계: [261008-01-account-delete.md](../design/261008-01-account-delete.md)

| 요청 | 본문 | 응답 |
|---|---|---|
| `DELETE /api/me` | `{ "confirm": "<닉네임 또는 '탈퇴'>" }` | `204`, 세션 쿠키를 지운다. 비로그인 `401`, 확인 문구가 다르면 `400 CONFIRM_MISMATCH` |

- 확인 문구: 닉네임을 똑같이(앞뒤 공백만 무시), 닉네임 전이면 "탈퇴" (`deleteConfirmText`, `shared/src/account.ts`). 요청 위조 방지(Origin 확인)를 받는다.
- 한 트랜잭션에서 지운다(`server/src/auth/account.ts`): `best_daily`, `best_alltime`, `play_replays`, `plays`, `save_actions`, `game_saves`(성장형 게임 저장, [saves.md](./saves.md)), `sessions`(다른 기기 로그인도 끝남), `users`(닉네임은 다른 사람이 쓸 수 있게 된다).
  먼저 읽고 기본 키로 지운다(틈 잠금으로 다른 유저의 기록 저장과 교착이 나지 않게). 500개씩 나눠 지운다.
- 관리자 작업 기록(`admin_actions`)은 남기되, 이 유저가 대상인 닉네임 초기화 기록의 이전 닉네임(`detail.nickname`)을 지운다. 유저 번호만 남는다.
- 지운 뒤 그 프로세스의 랭킹 캐시를 비운다. 다른 유저의 순위·환산점은 조회할 때 다시 계산된다.
- 같은 Google 계정으로 다시 로그인하면 기록이 없는 새 유저로 시작한다.

화면 (`client/src/components/AccountDeleteDialog.vue`, 앱 맨 위에 둔다. 상단 바 안에 두면 바의 `backdrop-filter` 때문에 창이 바 안에 갇힌다):

- 제목 "탈퇴할까요?", 되돌릴 수 없다는 안내, 지워지는 것(모든 게임 기록과 랭킹, 닉네임, 다른 기기의 로그인까지 모두), 확인 문구 입력칸(열리면 초점).
- 입력이 확인 문구와 같을 때만 "탈퇴"(빨강)가 켜진다. 실패하면 서버 문구를 창 안에 보여준다.
- 탈퇴하면 `/?account=deleted`로 페이지를 새로 열어 화면에 남은 내 정보를 모두 비우고 "탈퇴했어요."를 띄운다.

