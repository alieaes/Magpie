# 스펙: 사과게임 (`apple-ten`)

설계: [261006-09-apple-ten.md](../design/261006-09-apple-ten.md). 지금은 **연습 모드만** 있다(기록이 남지 않는다).

## 규칙 (`games/apple-ten/src/logic`)

| 항목 | 값 |
|---|---|
| 판 | 17 × 10 = 170칸. 칸마다 1~9. 인덱스 = r × 17 + c, 지워진 칸은 0 |
| 판 만들기 | `createBoard(seed)`: 시드 난수로 칸마다 1~9를 고르게 뽑는다. 다 풀 수 있는 판을 보장하지 않는다 |
| 선택 | 칸 좌표 사각형 `{ c1, r1, c2, r2 }`(양 끝 포함). 안의 합이 정확히 10이면 사과를 지운다. 지워진 칸은 0으로 친다 |
| 점수 | 지운 사과 1개당 1점. 0~170 |
| 시간 | 120초 = 7200틱 |

- `trySelect(board, rect)`: 합이 10이면 지우고 지운 개수, 아니면 판을 그대로 두고 0. 판 밖이거나 순서가 뒤집힌 사각형도 0.
- `replay(seed, inputs)`: 입력을 처음부터 다시 적용해 `{ ok, score, ticks }`. 실패 사유:

| 사유 | 경우 |
|---|---|
| `too_many_inputs` | 입력이 85개 초과 (한 번에 최소 2개가 지워지므로) |
| `bad_tick` | 틱이 정수가 아니거나, 줄어들거나, 7200을 넘음 |
| `bad_rect` | 판 밖이거나 c1 > c2, r1 > r2 |
| `no_match` | 그 선택으로 지워지는 사과가 없음 |

- 입력 기록: 사과가 실제로 지워진 선택만 `{ t, c1, r1, c2, r2 }`로 남긴다. `t`는 그때의 틱.
- 결정성: 정수 연산과 시드 난수(`shared/src/random.ts`)만 쓴다. 테스트: `games/apple-ten/test/logic.test.ts`.

## 시드 난수 (`shared/src/random.ts`)

- 시드 문자열 → cyrb128 해시(32비트 정수 4개) → xoshiro128**. `Math.imul`과 비트 연산만 쓴다.
- `randomSeed()`: 무작위 16바이트 → 16진 32자. 게임 로직 안에서는 부르지 않는다.
- 수열은 바꾸면 안 된다(저장된 판의 재계산이 달라진다). 테스트가 첫 값 4개를 고정해 둔다.

## 화면

### 게임 (`games/apple-ten/src/scene`, Phaser 4)

- 캔버스는 칸 96px로 크게 만들고 화면에 맞춰 줄인다(Scale FIT, 가운데). 가로 1688 × 1016, 세로 1016 × 1688.
- **판 방향**: 게임 영역이 세로로 길면 판을 전치해서(가로·세로를 맞바꿔) 10 × 17로 그린다. 로직 좌표는 그대로다. 영역 비율이 바뀌면 다시 맞춘다.
- 드래그: 사각형을 청록 점선으로 그리고, 안에 중심이 들어온 사과에 청록 테두리를 켠다. 합계는 보여주지 않는다.
  손을 떼면 합이 10일 때 사과가 살짝 튀어 오르며 사라진다(260ms).
- 판 바탕·테두리·액센트 색은 셸의 CSS 변수(`--surface`, `--border-strong`, `--accent`)에서 읽는다. 반투명 색은 바탕 위에 섞는다.
- 시간은 실제 경과 시간(`performance.now`)으로 틱을 센다. 7200틱이 되면 끝.
- 화면이 가려지면(`visibilitychange` → hidden) 판을 끝낸다.

### 플레이 페이지 (`/play/:gameId`, `client/src/pages/PlayPage.vue`)

- `playable`이고 게임 코드가 등록된 게임(`client/src/games/registry.ts`)만 연다. 아니면 "페이지를 찾을 수 없어요".
- 시작 전: 게임 이름, 규칙 설명(`howTo`), "연습 모드 · 기록은 로그인 기능이 열리면 남아요", "시작".
- 플레이 중: 남은 시간 막대(10초 이하면 빨강)와 초, 점수, "끝내기". 게임 영역은 상단 바·머리줄을 뺀 화면 높이.
- 끝: "시간 종료"(시간이 다 됨) 또는 "게임 끝", 점수, "연습 모드라 기록은 남지 않아요", "다시 하기", "랭킹 보기"(사과게임 탭).
- 게임 영역에서는 페이지가 스크롤되지 않는다(`touch-action: none`).
- 개발 중에는 `?seed=`로 시드를 고정할 수 있다.

## 셸과 게임의 약속 (`@magpie/shared/game-module`)

- 게임 패키지 기본 내보내기 `GameModule.mount(parent, { seed, onHud, onEnd })` → `{ finish(), destroy() }`.
- `onHud({ score, timeLeftTicks?, timeLimitTicks? })`, `onEnd({ seed, inputs, ticks, score })`.
- 1초 = 60틱 (`TICKS_PER_SECOND`, `@magpie/shared`).
