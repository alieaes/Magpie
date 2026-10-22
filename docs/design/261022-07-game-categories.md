# 설계: 게임 분류 — 미니게임과 게임

Magpie는 한 판으로 끝나는 미니게임을 모으고, 랭킹을 매일 밤 새로 시작하는 컨셉이었다.
[붕어빵 가게](./261021-01-fish-bun.md)처럼 하루씩 저장하며 오래 즐기는 게임이 늘어날 것이라, 게임을 **미니게임**과 **게임** 두 분류로 나눈다.
미니게임은 지금 그대로 두고, 게임은 날마다 초기화하지 않는 전체 랭킹 하나만 둔다. 관리자 초기화는 [261022-08](./261022-08-game-ranking-reset.md)에서 따로 정한다.

---

## 1. 분류

| 분류 | 내부 `kind` | 지금 게임 | 랭킹 |
|---|---|---|---|
| 미니게임 | `minigame` (없으면 이것) | 사과게임, 복권 긁기 (앞으로 광고 속 게임도) | **지금 그대로**: 일간(KST 00:00 초기화) + 역대, 총합에 들어감 |
| 게임 | `growth` | 붕어빵 가게 | **전체 랭킹 하나**. 날마다 초기화하지 않고 관리자 초기화로만 비운다. 총합에 안 들어감(지금과 같음) |

- 내부 이름 `growth`는 그대로 둔다. 저장·셸·로직 규격(`GrowthLogic`, `GrowthPlayView`, `GrowthSession`)이 이 이름을 쓰고, 지금 "게임" 분류는 곧 하루 단위로 저장하는 게임이다. **화면에 보이는 이름만 "게임"이다.**
- 분류 이름표는 `shared/src/games.ts`에 둔다: `GAME_KIND_LABELS = { minigame: '미니게임', growth: '게임' }`, `gameKind(game)`(없으면 `minigame`).

---

## 2. 게임 분류의 랭킹

- 점수는 지금과 같은 **하루 최고 수익**(가장 많이 번 하루). 기존 `best_alltime` 표를 그대로 쓴다.
  가게가 자랄수록 하루 수익도 오르므로, 초기화하지 않는 랭킹에서는 "가게를 얼마나 키웠나"가 그대로 드러난다.
- **일간 랭킹이 없다.**
  - 게임 분류의 판은 `best_daily`에 쓰지 않고 `best_alltime`만 갱신한다(`server/src/plays/bests.ts`).
    이미 쌓인 붕어빵 가게 `best_daily` 줄은 읽지 않고 그대로 둔다(탈퇴·기록 삭제 때 지금처럼 같이 지워진다).
  - `GET /api/rankings`: 게임 분류 대상은 `period`를 빼면 `alltime`, `daily`면 `400 BAD_REQUEST`("이 게임은 일간 랭킹이 없어요").
    미니게임·총합은 지금처럼 기본 `daily`.
- 하루 끝 응답(`POST /api/plays/:id/finish`)의 순위:
  - 미니게임은 지금처럼 `rank: { today }`.
  - 게임 분류는 `rank: { today: null, allTime: N }`, `best.today`는 늘 `false`.
  - 붕어빵 가게 정산 문구: "저장했어요 · 최고 수익 · 전체 N위" (지금은 "역대 최고 수익 / 오늘 최고 수익 · 오늘 N위").
- 로비 요약(`GET /api/games/summary`): 게임 분류는 `todayTop`·`myTodayBest`가 `null`이고 `allTimeTop: { nickname, score } | null`을 더한다.

---

## 3. 로비 (메인)

- 게임 카드를 두 묶음으로 나눈다. 순서는 **미니게임 → 게임**, 묶음 안은 `games.ts` 순서. 플레이할 수 있는 게임이 없는 묶음은 통째로 숨긴다.

| 묶음 | 제목 | 제목 옆 작은 설명 |
|---|---|---|
| 미니게임 | 미니게임 | 한 판으로 끝나요 · 랭킹은 매일 밤 12시에 새로 시작 |
| 게임 | 게임 | 하루씩 저장하며 키워요 · 랭킹은 이어져요 |

- 맨 위 소개 "랭킹은 매일 밤 12시에 새로 시작해요."는 묶음 설명으로 옮겨 가므로 "한 판 승부 미니게임과 오래 키우는 게임이 있어요."로 바꾼다.
- 카드 아래 줄:
  - 미니게임: 지금 그대로("오늘 1위", "내 최고").
  - 게임: "1위"(전체 1위, 없으면 "첫 기록에 도전"), "내 가게 N일째", "내 최고".
- 배치 규칙(1024px 이상 두 단, 그 아래 3열 / 2열)은 그대로. 묶음 사이 간격 32px(모바일 24px). 오른쪽 랭킹 패널은 첫 묶음 제목 줄에 맞춘다(지금과 같음).
- 폰(2열)에서 게임 묶음이 한 장뿐이면 카드가 반 폭으로 놓인다. 다른 카드와 크기가 같아 그대로 둔다.

---

## 4. 랭킹 패널(메인) · 랭킹 페이지

- **대상 고르기를 분류로 묶는다.**
  - 패널 선택 상자: `<optgroup label="미니게임">` 총합·사과게임·복권 긁기, `<optgroup label="게임">` 붕어빵 가게.
  - 랭킹 페이지 탭: `총합 · 사과게임 · 복권 긁기 | 붕어빵 가게` — 두 묶음 사이에 세로 구분선. 탭 줄은 지금처럼 가로 스크롤.
- **게임 분류를 고르면 일간/역대 전환을 숨기고** 늘 전체 랭킹을 보여준다.

| 자리 | 미니게임·총합 (지금 그대로) | 게임 분류 |
|---|---|---|
| 패널 제목 | 오늘의 랭킹 / 역대 랭킹 | 전체 랭킹 |
| 페이지 시간 줄 | 날짜 · 초기화까지 N시간 M분 / 전체 기간 | 전체 기간 · 매일 초기화되지 않아요 |
| 빈 목록 | 아직 오늘 기록이 없어요 / 아직 기록이 없어요 | 아직 기록이 없어요 |
| 패널 "전체 랭킹 보기" | `?target=…&period=…` | `?target=fish-bun` (기간 없이) |

- 주소에 `/ranking?target=fish-bun&period=daily`처럼 기간이 붙어 와도 게임 분류면 무시하고 전체로 보여준다. 미니게임 탭으로 돌아가면 쿼리의 기간을 따른다.
- 패널에서 게임 분류를 골랐다가 미니게임으로 돌아오면 그 전에 고른 일간/역대를 그대로 쓴다.
- 총합 탭 설명("미니게임마다 1위를 1,000점으로…")과 붕어빵 가게 `rankingNote`("하루 장사로 가장 많이 번 날의 수익이에요.")는 그대로.

---

## 5. 변경

| 위치 | 변경 |
|---|---|
| `shared/src/games.ts` | `GAME_KIND_LABELS`, `gameKind()` |
| `shared/src/ranking.ts` | `GameSummary.allTimeTop?` |
| `shared/src/plays.ts` | 하루 끝 응답 `rank.allTime?` |
| `server/src/plays/bests.ts` | 게임 분류는 `best_daily`를 건너뛴다 |
| `server/src/plays/service.ts` | 게임 분류는 전체 순위를 응답에 |
| `server/src/routes/rankings.ts`, `server/src/ranking/service.ts` | 게임 분류 기간 기본값·`daily` 거절, 요약의 `allTimeTop` |
| `client/src/pages/HomePage.vue`, `client/src/components/GameCard.vue` | 두 묶음, 게임 카드 "1위" |
| `client/src/rankingTargets.ts`, `RankingPanel.vue`, `TargetTabs.vue`, `client/src/pages/RankingPage.vue` | 분류 묶음, 게임 분류는 기간 전환 숨김 |
| `games/fish-bun/src/scene/` (`FishBunScene.ts`, `screens.ts`) | 정산 문구 "전체 N위" |
| `docs/spec/` | `ranking.md`, `main-page.md`, `saves.md`, `plays.md`, `fish-bun.md` |
| `CLAUDE.md` §1 | "수록 게임은 세 갈래다" → 두 분류(미니게임: 캐주얼 퍼즐·광고 속 가짜 게임 / 게임: 성장형)와 분류별 랭킹 |

- DB 표는 바꾸지 않는다.
- 서브모듈 `AviaryHub-Resource/Projects/Magpie/concept.md`에는 매일 초기화 이야기가 없어 고치지 않는다.

---

## 6. 테스트

- 서버
  - 게임 분류의 하루가 통과하면 `best_alltime`만 바뀌고 `best_daily`에는 줄이 생기지 않는다. 응답 `rank.allTime`이 전체 순위.
  - `GET /api/rankings?target=fish-bun`은 역대, `period=daily`면 `400`. 미니게임·총합은 기간을 빼면 지금처럼 일간.
  - 요약: 게임 분류는 `allTimeTop`이 전체 1위, `todayTop`은 `null`.
- 화면 (폰·PC)
  - 로비 두 묶음과 설명, 붕어빵 가게 카드의 "1위".
  - 패널·페이지에서 붕어빵 가게를 고르면 기간 전환이 사라지고 전체 랭킹, 다시 미니게임으로 가면 전에 고른 기간.
  - 붕어빵 가게 정산 문구.

---

## 7. 검토한 대안

| 대안 | 내용 | 판단 |
|---|---|---|
| 게임 분류 점수를 누적 수익으로 | 오래 할수록 계속 오른다. "꾸준히 즐기는" 성격에 더 맞다 | 새 집계(저장 상태나 판 합계)가 필요하다. 하루 최고 수익을 그대로 쓰고, 써 본 뒤 다시 본다 |
| 게임 분류에도 일간 유지 | 탭 구조를 덜 바꾼다 | 요청과 다르다. 오래 키운 가게가 매일 1위를 가져가 일간의 의미가 적다 |
| `kind` 값을 `game`으로 바꾸기 | 화면 이름과 맞는다 | 저장·셸 코드 곳곳을 바꿔야 하고 얻는 것이 없다 |

---

## 8. 결정 사항 (2026-10-22 컨펌)

- [x] 분류 이름 "미니게임" / "게임", 내부 `kind`는 `growth` 유지
- [x] 게임 분류 랭킹 점수는 하루 최고 수익 그대로 (누적 수익 아님)
- [x] 게임 분류는 일간 랭킹 없음, `best_daily`에 쓰지 않음
- [x] 로비는 두 묶음, 미니게임이 먼저

## 9. 구현 메모 (2026-10-22)

- 대상에 일간이 있는지는 `hasDailyRanking(target)`(`shared/src/ranking.ts`) 하나로 본다. 서버 라우트·요약·판 끝 응답과 화면이 같이 쓴다.
- 분류 순서는 `GAME_KINDS`, 분류별 게임은 `gameKind()`. 클라이언트의 랭킹 대상 묶음은 `rankingTargetGroups()`, 실제 보여줄 기간은 `effectivePeriod()`(`client/src/rankingTargets.ts`).
- `TargetTabs`는 선택지 목록 대신 묶음(`groups`)을 받는다.
- 붕어빵 가게 정산의 팡파르는 이제 `best.allTime`(내 최고 수익)일 때만.
- 확인: `server/test/saves.test.ts`(성장형 판은 `best_daily`에 안 씀, `rank.allTime`, 기간 기본값·`daily` 400, 요약 `allTimeTop`), 전체 테스트 통과.
  화면은 확인용 서버로 PC(1024px)·폰(375px)에서 로비 두 묶음, 패널 optgroup·"전체 랭킹"·기간 기억, 랭킹 페이지 구분선·`?period=daily` 무시·미니게임 탭 복귀를 봤다. 개발 DB에 붕어빵 가게 기록이 없어 정산 문구와 채워진 전체 랭킹은 화면으로 보지 못했다.
