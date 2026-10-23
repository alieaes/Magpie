# 스펙: 진동(햅틱) (`@magpie/shared/haptics`)

폰에 짧은 진동을 주는 공통 함수와 켜고 끄는 설정. 게임은 이 함수로만 진동을 쓴다.
근거: [261023-01-haptics.md](../design/261023-01-haptics.md)

## 공통 함수 (`shared/src/haptics.ts`)

브라우저 전용이라 서버가 가져가는 `@magpie/shared`와 나눠 `@magpie/shared/haptics`로 낸다.

| 함수 | 하는 일 |
|---|---|
| `haptic(kind)` | 진동 한 번. 꺼졌거나 못 하는 기기면 아무것도 하지 않는다 |
| `hapticSupport()` | 이 기기에서 쓸 방법 `'vibrate'`·`'ios-switch'`·`'none'` (처음 한 번 판단해 기억) |
| `hapticsEnabled()` / `setHapticsEnabled(on)` | 켜짐 여부 / 켜고 끄기(저장 + 구독자에게 알림) |
| `onHapticsChange(fn)` | 설정이 바뀌면 부른다. 해제 함수를 돌려준다 |
| `detectHapticSupport(env)` | 기기 판단 규칙(UA·`vibrate` 유무·손가락 입력). 테스트용으로 낸다 |
| `HAPTIC_PATTERNS`, `iosSwitchTick()` | 종류별 패턴 표, 아이폰 숨긴 스위치 누르기 (개발용 시험 화면이 직접 부른다) |

### 종류

| 종류 | 안드로이드 (ms) | 아이폰 (17.4 ~ 26.4) |
|---|---|---|
| `tap` | 12 | 톡 |
| `tick` | 8 (40ms에 한 번까지) | 없음 |
| `deny` | [15, 60, 15] | 없음 |
| `good` | [20, 50, 35] | 톡 |
| `great` | [30, 40, 30, 40, 90] | 톡 |
| `thud` | 40 | 없음 |

- 아이폰은 '톡' 하나뿐이라 실패 쪽(`deny`·`thud`)과 연달아 울리는 `tick`은 울리지 않는다.
- 패턴이 도는 동안 온 `tick`은 건너뛴다(`vibrate`를 새로 부르면 돌던 패턴이 끊긴다). 다른 종류는 바로 울린다.
- 안드로이드는 `navigator.userActivation.hasBeenActive`가 거짓이면(페이지를 아직 안 누름) 부르지 않는다.

### 기기 판단

- UA에 `iPhone`이 있으면 iOS 버전을 읽어 17.4 이상 26.5 미만이면 `'ios-switch'`, 아니면 `'none'`.
  - 버전은 Safari 버전(`Version/26.4`)으로 읽는다(iOS 26부터 UA의 OS 자리는 고정 값이라고 알려져 있다).
  - Safari 버전이 없는 UA(아이폰 크롬·앱 안 브라우저)는 OS 자리가 17.x일 때만 믿고, 나머지는 `'none'`.
  - iOS 26.5부터는 코드로 누른 스위치가 울리지 않는다. 손가락이 실제 스위치를 눌러야 해서 지금은 지원하지 않는다(설계 §6).
- 그 밖에는 `navigator.vibrate`가 함수이고 `(pointer: coarse)`면 `'vibrate'`(PC 크롬도 `vibrate`가 있어 손가락 입력으로 거른다). 아니면 `'none'`.
- 아이폰 스위치: 처음 부를 때 숨긴 `<input type="checkbox" switch>`와 그 label을 `body`에 붙여 두고 `label.click()`.

## 켜고 끄기

- 기본은 켜짐이다. `localStorage`의 `magpie.haptics`(`'0'` 꺼짐, `'1'` 켜짐)에 저장하고, 저장소를 못 쓰면 켜짐으로 친다.
- 상태는 공통 함수가 들고 저장한다. 셸과 게임이 같은 값을 바로 보므로 `GameMountOptions`·`GrowthMountOptions`로 넘기지 않는다.
- `hapticSupport()`가 `'none'`이면 어디에도 진동 설정을 보이지 않는다(PC에서는 안 보인다).
- 미니게임: 플레이 중 머리줄의 음량 막대 뒤에 진동 버튼([apple-ten.md](./apple-ten.md) 플레이 페이지). 셸은 `client/src/composables/useHaptics.ts`로 Vue 값에 잇는다. 켜면 `tap`을 한 번 울린다.
- 붕어빵 가게: 게임 안 설정 창과 멈춤 창의 소리 줄 아래 "진동" 줄([fish-bun.md](./fish-bun.md)).

## 쓰는 곳

- 붕어빵 가게 빵틀 탭: [fish-bun.md](./fish-bun.md)
- 복권 긁기: [lucky-scratch.md](./lucky-scratch.md)
- 진동은 화면(`scene`)에서만 부른다. 로직(`logic`)은 진동과 무관하다.

## 개발용 시험 화면 (`/dev/haptics`, 개발 빌드에서만)

`client/src/pages/dev/HapticsLab.vue`. 폰으로 열어 어떤 방식이 울리는지 손으로 확인한다. 폰은 같은 와이파이에서 개발 서버를 `--host`로 띄워 연다.

- 이 기기: `hapticSupport()`, 진동 설정, `vibrate` 유무, `(pointer: coarse)`, `userActivation`, UA.
- 1: 종류별 `haptic()` 버튼과 진동 켜기/끄기. 2: 기기 판단 없이 `navigator.vibrate`, 숨긴 스위치 코드 클릭.
- 3: 손가락이 직접 누르는 숨은 스위치를 덮은 상자(iOS 26.5 이상 방식). 스위치가 바뀐 횟수를 센다.
- 4: Phaser 캔버스(왼쪽 그대로, 오른쪽 스위치 덮개). Phaser가 받은 누름(터치·마우스)·밖 누름·뗌·끌기 이동·덮개 스위치 횟수와 기록.
  입력 방식 두 가지(캔버스 기본 / 게임 칸 대상 + 창 이벤트 끔)로 다시 만들 수 있다.
  - Phaser는 캔버스가 아닌 요소(덮개)에서 시작한 누름을 `POINTER_DOWN`이 아니라 `POINTER_DOWN_OUTSIDE`로 보낸다(두 입력 방식 모두). 덮개를 게임에 쓰려면 이걸 받아 처리해야 한다.

## 테스트

`shared/test/haptics.test.ts`: UA별 기기 판단(안드로이드·PC·파이어폭스·아이폰 Safari 버전 경계·아이폰 크롬·아이패드), 종류별 패턴, `tick` 간격, 패턴 도는 동안 `tick` 건너뛰기, 페이지를 안 눌렀으면 안 부름, 끄기·저장·다시 불러오기, 저장소 실패, 아이폰은 성공 쪽만 스위치를 누름, 지원 안 하는 기기.
