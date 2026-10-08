# 스펙: 판 기록과 점수 제출

설계: [261006-08-play-submission.md](../design/261006-08-play-submission.md). 모든 게임이 같은 흐름을 쓴다.

## 흐름

```
[시작] POST /api/plays            → 판 생성(pending), 시드 발급, 시작 시각 기록
  ... 클라이언트가 그 시드로 플레이, 입력을 틱 번호와 함께 기록 ...
[끝]   POST /api/plays/:id/finish → 형식 → 시간 → 재계산 → 점수 검사 → accepted / rejected
```

- **기록 모드**: 로그인 + 닉네임. 서버가 시드를 준다. 아니면 **연습 모드**(셸이 시드를 만들고 기록이 안 남는다).
- 셸은 게임 코드를 먼저 내려받고 판을 연다. 서버는 판을 연 때부터 시간을 재므로 내려받는 시간이 들어가지 않게 한다.
- 같은 유저가 같은 게임의 판을 새로 열면 안 끝난 이전 판은 `rejected`(`abandoned`)가 된다.
- 끝나지 않고 하루가 지난 판은 서버 시작 때와 하루 한 번 `abandoned`로 정리한다(`abandonStalePlays`).

## 게임 로직 규격 (`shared/src/game-logic.ts`)

게임 패키지의 `logic`이 `GameLogic`을 내놓고, 서버는 `server/src/plays/logics.ts`에 등록한다.

| 항목 | 내용 |
|---|---|
| `maxTicks` | 한 판 최대 틱 수 |
| `maxScore` | 이론상 최고 점수 |
| `inputSchema` | 입력 기록 형식(Zod). 입력 개수 상한도 여기서 막는다 |
| `replay(seed, inputs)` | `{ ok: true, score, ticks }` 또는 `{ ok: false, reason, index }`. `ticks`는 마지막 입력의 틱 |

- 기록할 수 있는 게임: 게임 목록에서 `playable`이고 서버에 로직이 등록된 게임 (`isRecordable`).
- 재계산은 `ReplayRunner` 자리(`server/src/plays/replay-runner.ts`)에서 돈다. 지금은 요청 처리 중에 바로 돌린다(`inlineReplayRunner`).

## 검사 (`server/src/plays/judge.ts`)

순서대로 보고, 걸리면 `rejected`와 사유를 남긴다.

| 검사 | 걸리는 경우 | 사유 |
|---|---|---|
| 형식 | `inputSchema`에 안 맞음(입력 개수 초과 포함) | `bad_input` |
| 시간 | `ticks > maxTicks`, 또는 실제 경과 초와 `ticks / 60`의 차이가 `5 + 0.1 × ticks / 60`초를 넘음 | `time` |
| 재계산 | `replay` 실패, 또는 마지막 입력의 틱이 보낸 `ticks`보다 뒤 | `bad_input` |
| 점수 | 재계산 점수 ≠ 보낸 점수, 또는 `> maxScore` | `mismatch` |

- 실제 경과 시간 = 끝 요청을 받은 시각 − 판을 연 시각 (둘 다 서버 시계).
- 통과하면 `accepted`, 점수는 서버가 낸 값.

## 저장

| 표 | 내용 |
|---|---|
| `plays` | `status`, `reject_reason`(`bad_input` / `time` / `mismatch` / `abandoned` / `admin`(관리자가 지움, [admin.md](./admin.md))), `score`(통과한 판만, 서버 점수), `client_score`(보낸 점수), `ended_at`(끝 요청 시각. 버려진 판은 NULL) |
| `play_replays` | 보낸 `inputs`의 JSON을 gzip. 거절된 판도 남긴다 |
| `best_daily`, `best_alltime` | 통과한 판이 더 좋을 때만 갱신. 동점이면 먼저 달성한 기록을 둔다. 일간의 날짜는 끝 요청 시각의 KST 날짜 |

- 판을 닫는 것(`status = 'pending'`일 때만 바꿈), 입력 기록, 최고 기록 갱신은 한 트랜잭션이다. 같은 판의 끝 요청이 동시에 오면 하나만 처리된다.
- 최고 기록은 `INSERT ... ON DUPLICATE KEY UPDATE`로 더 좋을 때만 값을 바꾸고(고칠 값은 `score`를 맨 끝에 둔다), 바뀌었는지는 다시 읽어 `play_id`로 본다(`server/src/plays/bests.ts`).
- 잠금: 조건으로 찾는 UPDATE·DELETE는 맞는 줄이 없을 때 틈(gap) 잠금을 걸어 다른 유저의 INSERT와 교착이 난다. 그래서 먼저 읽고 기본 키로 고친다(판 시작의 이전 판 버리기, 관리자 기록 삭제).
- 최고 기록이 바뀌면 그 프로세스의 랭킹 캐시를 비운다. 다른 프로세스는 10초 안에 따라온다.

## API

| 요청 | 본문 | 응답 |
|---|---|---|
| `POST /api/plays` | `{ "gameId" }` | `200 { playId, seed }`. 비로그인 `401 UNAUTHORIZED`, 닉네임 전 `403 NICKNAME_REQUIRED`, 없는·기록할 수 없는 게임 `400 BAD_REQUEST`, 유저당 분당 20회 초과 `429 TOO_MANY_REQUESTS` |
| `POST /api/plays/:id/finish` | `{ inputs: [], ticks, score }` | `200 { accepted: true, score, best: { today, allTime }, rank: { today } }` 또는 `200 { accepted: false, reason }` |

`finish`의 오류(판을 건드리지 않는다):

| 경우 | 응답 |
|---|---|
| 비로그인 | `401 UNAUTHORIZED` |
| 본문 겉모양이 틀림(`inputs`가 배열이 아님, `ticks`·`score`가 정수가 아님 등) | `400 BAD_REQUEST` |
| 본문 256KB 초과 | `413 TOO_LARGE` |
| 없는 판 / 남의 판 / 이미 끝난 판 | `404 NOT_FOUND` / `403 FORBIDDEN` / `409 PLAY_FINISHED` |

- `rank.today`: 그 게임의 오늘 순위. 날짜가 바뀌는 순간이면 `null`일 수 있다.
- 형식은 `shared/src/plays.ts`(`StartPlayResponse`, `FinishPlayRequest`, `FinishPlayResponse`, `PlayRejectReason`).
- 요청 횟수 제한은 프로세스 메모리에 둔다(`server/src/lib/rate-limit.ts`, 지난 60초 안의 요청 수).

## 화면 (`client/src/pages/PlayPage.vue`)

- 시작 전 안내: 비로그인 "연습 모드 · 로그인하면 기록이 남아요", 닉네임 전 "연습 모드 · 닉네임을 정하면 기록이 남아요", 기록 모드 "기록 모드 · 점수가 랭킹에 올라가요". 개발 중 `?seed=`로 시드를 고정하면 연습 모드.
- 끝: 점수, 최고 기록을 바꿨으면 "역대 최고 기록" 또는 "오늘 최고 기록" 표시, "기록했어요 · 오늘 N위".
  거절되면 사유 문구(빨강), 보내지 못하면 "기록을 보내지 못했어요." + "다시 보내기". 보내는 동안은 "기록을 확인하는 중"이고 "다시 하기"가 꺼진다.
- 판을 열다가 실패하면 서버 문구를 보여주고 "다시 시도". 로그인이 풀렸으면(401) 로그인 상태를 다시 받아 다음 시도는 연습 모드가 된다.

## 막지 못하는 것

봇·자동 풀이는 유효한 입력 기록을 만든다. 입력 간격 검사는 아직 없다.
