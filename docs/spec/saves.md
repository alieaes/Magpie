# 스펙: 성장형 게임 저장

설계: [261021-04-game-save.md](../design/261021-04-game-save.md), 랭킹은 [261021-05-growth-ranking.md](../design/261021-05-growth-ranking.md).
하루 단위로 저장하며 키우는 게임(`GameMeta.kind = 'growth'`)이 쓰는 저장·검증·셸 흐름. 지금 등록된 성장형 게임은 `fish-bun`(붕어빵 가게, [fish-bun.md](./fish-bun.md))이다.

## 원칙

- 저장은 서버에만 있다. 클라이언트가 보낸 저장 데이터는 받지 않는다.
- 저장은 **하루 결과**(서버가 그날을 다시 돌려 낸 다음 날 상태)와 **가게 행동**(서버가 규칙을 확인하고 적용한 결과)으로만 바뀐다.
- 하루 = 판 하나. 판을 열 때 그때의 저장 버전을 판에 적고, 하루가 끝나면 그 버전의 상태로 다시 돌려 검증한다.
- 하루 도중에는 저장하지 않는다. 중간에 나가면 그날은 사라지고, 다시 오면 그날 아침 상태로 새 판을 연다.

## 로그인과 체험

| 상태 | 할 수 있는 것 |
|---|---|
| 로그인 + 닉네임 | 저장, 이어하기, 랭킹 기록 |
| 비로그인 · 닉네임 전 · 개발용 `?seed=` | 체험: 게임이 내놓은 시작 상태(`initialState`)로 하루를 해 볼 수 있다. 서버와 이야기하지 않고 아무것도 저장하지 않는다 |

## 게임 로직 규격 (`shared/src/game-logic.ts`의 `GrowthLogic`)

| 항목 | 내용 |
|---|---|
| `kind: 'growth'` | 성장형 표시. 미니게임 `GameLogic`과 함께 `AnyGameLogic`으로 등록한다 |
| `maxTicks`, `maxScore`, `inputSchema` | 하루 기준. 미니게임과 같다 |
| `stateSchema`, `initialState()`, `migrate?(data)` | 저장 상태 형식(Zod), 시작 상태, 예전 형식을 고치는 함수(없으면 그대로) |
| `replayDay(seed, inputs, state)` | `{ ok, score, ticks, nextState }` 또는 `{ ok: false, reason, index }` |
| `actionSchema`, `applyAction(state, action)` | 가게 행동 형식과 적용. 규칙에 안 맞으면 `{ ok: false, reason }` |
| `dayOf(state)` | 몇 일째인지 (로비 카드) |

- 서버의 로직 등록부는 `LogicRegistry`(`server/src/plays/logics.ts`). `createApp`·서비스에 바꿔 끼울 수 있고, 서버 테스트는 `fish-bun` 자리에 단순한 시험용 가게 로직(`server/test/growth-fixture.ts`)을 끼워 저장 흐름만 확인한다(붕어빵 가게 규칙은 게임 패키지 테스트가 본다).
- 재계산 자리 `ReplayRunner`에 `replayDay`가 있다(`server/src/plays/replay-runner.ts`).

## 표 (`db/007_game_saves.sql`)

| 표 | 키 | 열 |
|---|---|---|
| `game_saves` | (`user_id`, `game_id`) | `version`(1부터, 바뀔 때마다 +1), `data`(JSON, 16KB 상한 `SAVE_MAX_BYTES`), `created_at`, `updated_at` |
| `save_actions` | `id` | `user_id`, `game_id`, `version`(적용 전 버전), `action`(JSON), `created_at` |
| `plays.save_version` | — | 성장형 판을 연 때의 저장 버전. 미니게임은 NULL |

- `play_replays`의 하루 입력 기록과 `save_actions`로 시작 상태부터 저장을 다시 만들 수 있다.
- 저장 줄은 기본 키로만 읽고 고친다. 바꿀 때는 트랜잭션 안에서 줄을 잠그고(`SELECT ... FOR UPDATE`) 버전을 확인한 뒤 1 올린다(`server/src/saves/store.ts`).
- 저장이 없으면 시작 상태로 만든다(`INSERT IGNORE`, 버전 1). 불러오기·하루 시작·가게 행동이 모두 이것을 먼저 부른다.
- 읽은 `data`는 `migrate` → `stateSchema`로 확인한다. MariaDB의 JSON은 문자열로 올 수 있어 풀어서 쓴다.

## API

| 요청 | 본문 | 응답 |
|---|---|---|
| `GET /api/saves/:gameId` | — | `200 { version, state }`. 비로그인 `401`, 닉네임 전 `403 NICKNAME_REQUIRED`, 없는 게임·성장형이 아니거나 기록할 수 없는 게임 `400` |
| `POST /api/saves/:gameId/actions` | `{ version, action }` | `200 { version, state }` |
| `POST /api/plays` | `{ gameId }` | 성장형이면 응답에 `saveVersion` |
| `POST /api/plays/:id/finish` | `{ inputs, ticks, score }` | 성장형이 통과하면 응답에 `save: { version, state }` |

가게 행동의 실패:

| 경우 | 응답 |
|---|---|
| 보낸 `version`이 지금 저장과 다름 | `409 { error: { code: 'SAVE_CONFLICT' }, save }` (최신 저장) |
| 게임 규칙 위반 (돈 부족 등) | `400 { error: { code: 'ACTION_REJECTED' }, reason }` |
| 행동 형식이 `actionSchema`와 다름, 본문 겉모양이 틀림 | `400 BAD_REQUEST` |
| 본문 8KB 초과 / 유저당 분당 60회 초과 | `413 TOO_LARGE` / `429 TOO_MANY_REQUESTS` |

- 형식은 `shared/src/saves.ts`(`SaveSnapshot`, `SaveActionRequest`, `SaveConflictBody`, `ActionRejectedBody`).
- 통과한 행동은 `save_actions`에 남는다.

## 하루 검증 (`POST /api/plays/:id/finish`, 성장형)

[plays.md](./plays.md)의 검사에 더해:

1. 판의 `save_version`이 지금 저장 버전과 다르면 재계산 없이 거절, 사유 `stale_save`(판을 연 뒤 다른 기기·탭에서 하루를 끝냈거나 강화를 샀다).
2. 시간 검사는 일시정지를 허용한다: `ticks ≤ maxTicks`이고 `ticks / 60 ≤ 실제 경과 + 5초`면 통과. 실제 시간이 더 긴 것은 괜찮다.
3. 재계산은 `replayDay(seed, inputs, 판을 연 때의 저장 상태)`.
4. 한 트랜잭션에서 저장 줄을 잠그고 버전을 다시 확인한 뒤(그사이 바뀌었으면 `stale_save`), 판 닫기, 입력 기록, 저장 갱신(`nextState`, 버전 +1), 최고 기록 갱신을 한다.

거절된 하루는 저장을 바꾸지 않는다.

## 셸 (`client`)

- `/play/:gameId`에서 게임의 `kind`가 `growth`면 `client/src/pages/GrowthPlayView.vue`가 맡는다. 셸의 시작·결과 화면과 시간·점수 막대가 없다.
  - 머리줄: 게임 이름, 체험 안내("체험 · 로그인하면 가게가 저장돼요" / "체험 · 닉네임을 정하면 가게가 저장돼요"), 소리 버튼·음량, "나가기".
  - 로그인 상태를 받은 뒤 가게를 띄우고, 저장할 수 있는지가 바뀌면(로그인·닉네임) 다시 띄운다. 불러오다 실패하면 "가게를 불러오지 못했어요" + 다시 시도.
  - 게임이 `onDayActive(true)`로 장사 중이라고 알리면, 다른 페이지로 갈 때 "장사를 그만둘까요?"를 묻는다. 탭을 닫거나 새로 고치면 브라우저가 묻는다(`beforeunload`).
- 셸과 게임의 약속(`@magpie/shared/game-module`): `GrowthGameModule { kind: 'growth', initialState(), mount(parent, { session, save, muted?, volume?, onDayActive? }) }` → `GrowthInstance { setMuted?, setVolume?, destroy }`.
- `GrowthSession`(`client/src/games/growthSession.ts`): 게임은 서버 주소를 모르고 이것으로만 이야기한다.

| 함수 | 저장(`saved`) | 체험(`trial`) |
|---|---|---|
| `load()` | 보내지 못한 하루가 있으면 먼저 보낸 뒤 `GET /api/saves/:gameId` | 시작 상태(버전 0) |
| `startDay()` | `POST /api/plays` → `{ seed }` | 무작위 시드(또는 `?seed=`) |
| `finishDay(result)` | `POST /api/plays/:id/finish` 응답 그대로. 보내지 못하면 예외 | 저장 없이 통과 응답 |
| `act(action)` | `{ ok: true, save }` / `{ ok: false, reason, save? }`(`conflict`면 최신 저장) | `{ ok: false, reason: 'trial' }` |
| `requestLogin()` | 비로그인이면 Google 로그인, 닉네임 전이면 닉네임 창 | 같음 |

- 창구가 저장 버전을 기억해 가게 행동에 붙인다(불러오기·하루 시작·하루 끝·행동 결과로 갱신).
- 하루를 보내기 전에 기록을 `localStorage`(`magpie.pendingDay.<gameId>`)에 적고, 서버가 판정하면(통과·거절·4xx) 지운다. 연결 실패·5xx면 남겨 두고 다음 `load()` 때 다시 보낸다.
- 소리 설정은 미니게임과 같은 값을 쓴다(`client/src/composables/useSound.ts`, `magpie.muted`, `magpie.volume`).

## 로비·랭킹

- `GET /api/games/summary`: 로그인했고 저장이 있는 성장형 게임에 `progress: { day }`. 로비 카드에 "내 가게 N일째"로 나온다.
- 화면에서는 성장형을 **"게임" 분류**라고 부른다(미니게임과 나눈 로비 묶음·랭킹 대상 묶음, [main-page.md](./main-page.md)).
- 게임별 랭킹 점수는 하루 점수(판 점수) 그대로, `best_alltime`만 쓴다. **일간 랭킹이 없고**(날마다 초기화하지 않는 전체 랭킹 하나), **총합 랭킹에서는 뺀다**([ranking.md](./ranking.md)).
- 로비 요약은 오늘 1위 대신 전체 1위(`allTimeTop`)를 준다.
- 전체 랭킹은 관리자만 비울 수 있다(게임 랭킹 초기화, [admin.md](./admin.md)). 저장은 그대로다.
- 랭킹 페이지에서 게임 탭을 고르면 `GameMeta.rankingNote`가 있으면 그 한 줄을 보여 준다.

## 탈퇴

`game_saves`, `save_actions`도 같은 트랜잭션에서 지운다([auth.md](./auth.md)).

## 막지 못하는 것

- 봇·자동 플레이는 유효한 하루 기록을 만든다.
- 판을 열 때 시드를 주므로 그날 손님 순서 같은 것을 미리 계산할 수 있다.
- 하루가 마음에 안 들면 중간에 나가서 그날을 다시 할 수 있다(잃는 것은 시간뿐).
