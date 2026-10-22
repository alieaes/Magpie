# 스펙: 랭킹

설계: [261006-06-ranking.md](../design/261006-06-ranking.md), 분류별 랭킹 [261022-07-game-categories.md](../design/261022-07-game-categories.md)

## 종류

게임은 두 분류다([261022-07](../design/261022-07-game-categories.md)). 분류 이름은 `shared/src/games.ts`의 `GAME_KIND_LABELS`.

| 분류 | `GameMeta.kind` | 랭킹 |
|---|---|---|
| 미니게임 | `minigame`(없으면 이것) | 대상(게임별 / 총합) × 기간(일간 / 역대). 화면 기본값은 총합·일간 |
| 게임 | `growth`(성장형) | 게임별 **전체 랭킹 하나**(`alltime`). 일간이 없고, 날마다 초기화하지 않는다(관리자만 비울 수 있다, [admin.md](./admin.md)). 총합에 들어가지 않는다 |

- 대상에 일간이 있는지는 `hasDailyRanking(target)`(`shared/src/ranking.ts`)으로 본다.

## 규칙

- **일간**: 한국 시간(KST) 00:00 ~ 다음 날 00:00. 날짜 키는 `shared/src/time.ts`의 `kstDayKey`.
- **게임별**: 유저당 그 기간 최고 기록 하나. 정렬은 게임의 `sort`(`desc` 높을수록 / `asc` 낮을수록).
  동점이면 먼저 달성한 사람(`achieved_at`이 이른 쪽), 그것도 같으면 `user_id`가 작은 쪽이 위. 순위는 겹치지 않는다.
- **총합**: 게임별 순위를 환산점으로 바꿔 유저별로 더한다.
  - `환산점 = round(1000 × (N − 순위 + 1) / N)`, N = 그 기간 그 게임 참여자 수. 1위는 1000점.
  - 안 한 게임은 0점.
  - **성장형 게임(`kind: 'growth'`)은 넣지 않는다.** 플레이 시간이 쌓일수록 점수가 오르는 게임이라서다([saves.md](./saves.md)). 게임별 랭킹에는 나온다.
  - 총합이 같으면, 총합에 들어간 기록 중 가장 늦은 기록을 먼저 달성한 사람이 위.
  - SQL(윈도우 함수)로 계산한다 (`server/src/ranking/queries.ts`). 같은 공식의 TS 버전 `rankToPoints`는 화면 설명과 테스트에 쓴다.
- **반영 조건**: 판이 검증을 통과하면(`plays.status = 'accepted'`) 더 좋은 기록일 때만 `best_daily`, `best_alltime`을 갱신한다.
  동점이면 먼저 달성한 기록을 둔다. 성장형은 `best_alltime`만 갱신한다(예전에 쌓인 붕어빵 가게 `best_daily` 줄은 읽지 않는다). 점수 제출·검증은 [plays.md](./plays.md).

## 표

| 표 | 키 | 열 |
|---|---|---|
| `users` | `id` | `google_sub`(유일), `nickname`(유일, NULL 가능, 최대 20자), `role`(`user`/`admin`), `created_at` |
| `plays` | `id` | `user_id`, `game_id`, `seed`, `score`(통과한 판의 서버 점수, 아니면 NULL), `client_score`, `status`(`pending`/`accepted`/`rejected`), `reject_reason`, `started_at`, `ended_at` |
| `play_replays` | `play_id` | `data`(압축한 입력 기록) |
| `best_daily` | (`user_id`, `game_id`, `day`) | `score`, `achieved_at`, `play_id`. `day`는 KST 날짜 |
| `best_alltime` | (`user_id`, `game_id`) | `score`, `achieved_at`, `play_id` |

닉네임이 NULL인 유저는 랭킹에 "이름 없음"으로 나온다.

## 캐시

대상·기간(일간은 날짜까지)마다 **전체 순위**를 API 프로세스 메모리에 10초 둔다. 상위 N명과 내 순위는 거기서 잘라 준다.

## API

### `GET /api/rankings?target=&period=&limit=`

| 파라미터 | 값 | 기본값 |
|---|---|---|
| `target` | `total` 또는 게임 id | `total` |
| `period` | `daily` / `alltime`. 성장형 게임에 `daily`면 `400 BAD_REQUEST`("이 게임은 일간 랭킹이 없어요.") | `daily`, 성장형 게임은 `alltime` |
| `limit` | 1~100 | 10 |

응답 (`shared/src/ranking.ts`의 `RankingResponse`):
`target`, `period`, `participants`, `entries[{rank, nickname, score}]`,
일간이면 `day`(KST 날짜), `resetsAt`(다음 KST 00:00, ISO UTC), 로그인했고 기록이 있으면 `me{rank, score}`.
총합이면 `score`는 환산점 합. 잘못된 값은 `400 BAD_REQUEST`.
요청한 사람이 관리자면 각 줄에 `userId`, 게임별이면 `playId`도 붙는다([admin.md](./admin.md)).

### `GET /api/games/summary`

게임마다 `{ gameId, todayTop: {nickname, score} | null, myTodayBest, myAllTimeBest }`. `my*`는 비로그인이면 `null`.
성장형 게임은 `todayTop`·`myTodayBest`가 늘 `null`이고 전체 1위 `allTimeTop: {nickname, score} | null`이 붙는다.
로그인했고 저장이 있는 성장형 게임에는 `progress: { day }`(몇 일째)가 붙는다([saves.md](./saves.md)).
