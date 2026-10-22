# 스펙: 관리자

설계: [261008-02-admin.md](../design/261008-02-admin.md), 게임 랭킹 초기화 [261022-08-game-ranking-reset.md](../design/261022-08-game-ranking-reset.md)

## 관리자 지정

- `users.role`: `user`(기본) / `admin`. 화면에서는 바꿀 수 없고 명령으로만 바꾼다. `.env`의 DB에 적용된다.

| 명령 | 하는 일 |
|---|---|
| `pnpm admin:grant <닉네임>` | 관리자로 지정 |
| `pnpm admin:revoke <닉네임>` | 관리자 해제 |
| `pnpm admin:list` | 관리자 목록 (`#번호  닉네임`) |

- 닉네임은 대소문자를 구분하지 않는다(DB 정렬 규칙). 없는 닉네임이면 실패하고 끝난다(종료 코드 1).
- 세션 미들웨어가 요청마다 `role`을 읽으므로 지정·해제는 다음 요청부터 바로 반영된다.
- `GET /api/me`의 `user.isAdmin`으로 화면이 관리 메뉴를 보여준다. 실제 권한 확인은 항상 서버가 한다.

## 기능

| 기능 | 하는 일 |
|---|---|
| 기록 삭제 | 통과한(`accepted`) 판을 `rejected`(사유 `admin`, `score` NULL)로 바꾸고, 그 판을 가리키는 `best_daily`·`best_alltime` 줄을 지운다. 그 유저의 두 번째로 좋은 기록이 대신 올라오지는 않는다 |
| 닉네임 초기화 | 닉네임을 NULL로 비운다. 그 유저는 다음 접속 때 다시 정해야 하고, 그 전까지 랭킹에는 "이름 없음"으로 나온다 |
| 게임 랭킹 초기화 | "게임" 분류(성장형) 게임의 전체 랭킹(`best_alltime`) 줄을 모두 지운다. 판 기록·가게 저장·다른 게임 랭킹은 그대로라 가게는 이어서 하고, 그 뒤 끝나는 하루부터 다시 쌓인다. 미니게임은 대상이 아니다 |

- 모두 한 트랜잭션에서 대상 줄을 잠그고(`FOR UPDATE`) 처리한 뒤 `admin_actions`에 남긴다. 처리하면 그 프로세스의 랭킹 캐시를 비운다.
- 게임 랭킹 초기화는 순위 색인(`game_id, score`)으로 그 게임의 줄을 잠그고 읽은 뒤 기본 키로 500개씩 지운다(`server/src/lib/chunks.ts`, 탈퇴와 같이 쓴다).
  잠그기 전에 끝난 하루는 같이 지워지고, 그 뒤에 끝난 하루는 새 랭킹의 첫 기록이 된다.
  화면에서 되돌릴 수는 없다. 꼭 필요하면 판 기록(통과한 판 중 초기화 시각 전 유저별 최고)으로 손으로 다시 만든다.

## 작업 기록 (`admin_actions`)

| 열 | 내용 |
|---|---|
| `id`, `created_at` | |
| `admin_user_id` | 처리한 관리자 |
| `action` | `remove_play` / `reset_nickname` / `reset_ranking`(`db/008_admin_reset_ranking.sql`) |
| `target_user_id`, `play_id` | 대상. 외래 키가 없어서 대상이 탈퇴해도 번호가 남는다. 탈퇴하면 그 유저의 닉네임 초기화 기록에서 이전 닉네임을 지운다([auth.md](./auth.md) 탈퇴). 게임 랭킹 초기화는 둘 다 NULL |
| `detail` (JSON) | 처리 전 값. 기록 삭제 `{ gameId, score, removedDaily, removedAllTime }`, 닉네임 초기화 `{ nickname }`, 게임 랭킹 초기화 `{ gameId, removed }`(지운 줄 수만. 유저별 점수는 남기지 않는다) |

## API

모두 관리자만 쓴다. 비로그인 `401 UNAUTHORIZED`, 관리자가 아니면 `403 FORBIDDEN`. 요청 위조 방지(Origin 확인)를 받는다.

| 요청 | 성공 | 실패 |
|---|---|---|
| `POST /api/admin/plays/:playId/remove` | `204` | 없는 판 `404 NOT_FOUND`, 통과한 판이 아님(이미 지움 등) `409 PLAY_NOT_ACCEPTED` |
| `POST /api/admin/users/:userId/reset-nickname` | `204` | 없는 유저 `404 NOT_FOUND`, 이미 닉네임이 없음 `409 NICKNAME_EMPTY` |
| `POST /api/admin/games/:gameId/reset-ranking` | `204` | 없는 게임 `404 NOT_FOUND`, 미니게임 `400 BAD_REQUEST`("미니게임 랭킹은 초기화할 수 없어요."), 이미 비어 있음 `409 RANKING_EMPTY` |

- `GET /api/rankings`는 요청한 사람이 관리자일 때만 각 줄에 `userId`를, 게임별 랭킹이면 `playId`도 더해 준다.

## 화면

- 상단 바: 관리자면 닉네임 옆에 "관리자" 표시(모바일에서도 보인다).
- 랭킹 페이지(`/ranking`)에서만, 관리자면 각 줄 오른쪽에 점 세 개 버튼("관리") → 메뉴 "기록 삭제"(게임별 탭만, 빨강), "닉네임 초기화". 메인 패널에는 없다.
- 메뉴는 바깥을 누르거나 Esc로 닫힌다(`client/src/composables/useDismiss.ts`, 상단 바 메뉴와 같이 쓴다).
- 고르면 확인 창(`ConfirmDialog`):
  - 기록 삭제: "테스트03의 사과게임 142개 기록을 지울까요? 되돌릴 수 없어요."
  - 닉네임 초기화: "테스트03의 닉네임을 초기화할까요? 그 유저는 다음 접속 때 닉네임을 다시 정해야 해요."
  - 처리 중에는 버튼이 꺼지고 닫히지 않는다. 실패하면 서버 문구를 창 안에 보여준다.
- 처리하면 랭킹을 다시 불러온다. 닉네임 초기화 뒤에는 로그인 상태도 다시 받는다(자기 닉네임이면 닉네임 창이 열린다).
- 게임 랭킹 초기화: 랭킹 페이지의 **게임 분류 탭에서만** 시간 줄 오른쪽 끝에 [랭킹 초기화](작은 버튼, 빨강 글씨). 참여자가 0명이면 꺼진다. 메인 패널에는 없다.
  - 확인 창: "붕어빵 가게 랭킹을 초기화할까요? 12명의 기록이 지워지고, 가게 저장은 그대로예요. 되돌릴 수 없어요."(N은 지금 보이는 참여자 수), 버튼 "초기화".
