# 스펙: 랭킹

설계: [261006-06-ranking.md](../design/261006-06-ranking.md)

## 종류

대상(게임별 / 총합) × 기간(일간 / 역대). 화면 기본값은 총합·일간.

## 규칙

- **일간**: 한국 시간(KST) 00:00 ~ 다음 날 00:00. 날짜 키는 `shared/src/time.ts`의 `kstDayKey`.
- **게임별**: 유저당 그 기간 최고 기록 하나. 정렬은 게임의 `sort`(`desc` 높을수록 / `asc` 낮을수록).
  동점이면 먼저 달성한 사람(`achieved_at`이 이른 쪽), 그것도 같으면 `user_id`가 작은 쪽이 위. 순위는 겹치지 않는다.
- **총합**: 게임별 순위를 환산점으로 바꿔 유저별로 더한다.
  - `환산점 = round(1000 × (N − 순위 + 1) / N)`, N = 그 기간 그 게임 참여자 수. 1위는 1000점.
  - 안 한 게임은 0점.
  - 총합이 같으면, 총합에 들어간 기록 중 가장 늦은 기록을 먼저 달성한 사람이 위.
  - SQL(윈도우 함수)로 계산한다 (`server/src/ranking/queries.ts`). 같은 공식의 TS 버전 `rankToPoints`는 화면 설명과 테스트에 쓴다.
- **반영 조건**: 판이 검증을 통과하면(`plays.status = 'accepted'`) 더 좋은 기록일 때만 `best_daily`, `best_alltime`을 갱신한다.
  점수 제출·검증은 아직 없다 (사과게임 설계에서 만든다).

## 표

| 표 | 키 | 열 |
|---|---|---|
| `users` | `id` | `google_sub`(유일), `nickname`(유일, NULL 가능, 최대 20자), `created_at` |
| `plays` | `id` | `user_id`, `game_id`, `seed`, `score`(검증 전 NULL), `status`(`pending`/`accepted`/`rejected`), `started_at`, `ended_at` |
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
| `period` | `daily` / `alltime` | `daily` |
| `limit` | 1~100 | 10 |

응답 (`shared/src/ranking.ts`의 `RankingResponse`):
`target`, `period`, `participants`, `entries[{rank, nickname, score}]`,
일간이면 `day`(KST 날짜), `resetsAt`(다음 KST 00:00, ISO UTC), 로그인했고 기록이 있으면 `me{rank, score}`.
총합이면 `score`는 환산점 합. 잘못된 값은 `400 BAD_REQUEST`.

### `GET /api/games/summary`

게임마다 `{ gameId, todayTop: {nickname, score} | null, myTodayBest, myAllTimeBest }`. `my*`는 비로그인이면 `null`.
