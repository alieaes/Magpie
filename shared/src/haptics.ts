// 진동(햅틱) 공통 함수. 안드로이드는 Vibration API로 패턴을 울리고, 아이폰(iOS 17.4 ~ 26.4)은 숨긴 스위치를 코드로 눌러 '톡'을 낸다.
// iOS 26.5부터는 코드로 누른 스위치가 울리지 않아 지원하지 않는 기기로 친다(설정도 숨긴다).
// 켜고 끄기도 여기서 들고 브라우저에 저장한다. 셸과 게임이 같은 값을 바로 본다.
// 브라우저 전용이라 서버가 가져가는 '@magpie/shared'와 나눠 '@magpie/shared/haptics'로 낸다.
// 근거: docs/design/261023-01-haptics.md

/** 진동 종류 */
export type HapticKind = 'tap' | 'tick' | 'deny' | 'good' | 'great' | 'thud';

/** 이 기기에서 쓸 방법 */
export type HapticSupport = 'vibrate' | 'ios-switch' | 'none';

/** 안드로이드 패턴 (ms, [진동, 쉼, 진동, …]). 실기기로 만져 보고 고치는 값 */
export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = {
  tap: [12],
  tick: [8],
  deny: [15, 60, 15],
  good: [20, 50, 35],
  great: [30, 40, 30, 40, 90],
  thud: [40],
};

/** 아이폰은 '톡' 하나뿐이라 실패 쪽(deny·thud)과 연달아 울리는 tick은 울리지 않는다 */
const IOS_KINDS: ReadonlySet<HapticKind> = new Set(['tap', 'good', 'great']);
/** tick 사이 최소 간격 (ms) */
const TICK_GAP_MS = 40;
/** 켜고 끄기 저장 키 ('0' 꺼짐, '1' 켜짐) */
const STORE_KEY = 'magpie.haptics';
/** 숨긴 스위치 id */
const SWITCH_ID = 'magpie-haptic-switch';

/** 기기 판단에 쓰는 값 */
export interface HapticEnv {
  userAgent: string;
  /** navigator.vibrate가 함수인지 */
  hasVibrate: boolean;
  /** 주 입력이 손가락인지 (matchMedia '(pointer: coarse)'). PC 크롬도 vibrate가 있어서 걸러 낸다 */
  coarsePointer: boolean;
}

/** a가 b보다 앞선 버전인지 ([주, 부]) */
function versionBefore(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

/** 아이폰 UA에서 iOS 버전을 읽는다. 믿을 수 없으면 null */
function iosVersion(userAgent: string): [number, number] | null {
  // iOS 26부터 UA의 OS 자리는 고정 값이라고 알려져 있어 Safari 버전(= iOS 버전)을 먼저 본다
  const safari = /Version\/(\d+)(?:\.(\d+))?/.exec(userAgent);
  if (safari) return [Number(safari[1]), Number(safari[2] ?? 0)];
  // Safari 버전이 없는 UA(아이폰 크롬·앱 안 브라우저)는 OS 자리가 17.x일 때만 믿는다
  const os = /OS (\d+)_(\d+)/.exec(userAgent);
  return os && Number(os[1]) === 17 ? [17, Number(os[2])] : null;
}

/** 기기 판단. 아이폰은 코드로 누른 스위치가 울리는 iOS 17.4 ~ 26.4만 친다 */
export function detectHapticSupport(env: HapticEnv): HapticSupport {
  if (/iPhone/.test(env.userAgent)) {
    const v = iosVersion(env.userAgent);
    return v && !versionBefore(v, [17, 4]) && versionBefore(v, [26, 5]) ? 'ios-switch' : 'none';
  }
  return env.hasVibrate && env.coarsePointer ? 'vibrate' : 'none';
}

let support: HapticSupport | null = null;
let enabled: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();
let lastTickAt = Number.NEGATIVE_INFINITY;
/** 긴 패턴이 끝나는 시각. 그 전에 온 tick은 패턴을 끊지 않게 건너뛴다 */
let busyUntil = 0;
let iosLabel: HTMLLabelElement | null = null;

/** 이 기기에서 쓸 방법. 'none'이면 haptic()은 아무것도 하지 않고 진동 설정도 숨긴다 */
export function hapticSupport(): HapticSupport {
  if (support === null) {
    support =
      typeof navigator === 'undefined'
        ? 'none'
        : detectHapticSupport({
            userAgent: navigator.userAgent,
            hasVibrate: typeof navigator.vibrate === 'function',
            coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
          });
  }
  return support;
}

/** 진동이 켜져 있는지. 저장소를 못 쓰면 켜짐 */
export function hapticsEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(STORE_KEY) !== '0';
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

/** 켜고 끈다. 브라우저에 저장하고(실패는 무시) 구독자에게 알린다 */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORE_KEY, on ? '1' : '0');
  } catch {
    // 저장 실패는 무시한다
  }
  for (const fn of listeners) fn(on);
}

/** 설정이 바뀌면 부른다(셸 버튼·게임 안 설정 갱신용). 해제 함수를 돌려준다 */
export function onHapticsChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 진동 한 번. 꺼졌거나 못 하는 기기면 조용히 넘어간다 */
export function haptic(kind: HapticKind): void {
  const way = hapticSupport();
  if (way === 'none' || !hapticsEnabled()) return;
  const now = performance.now();
  if (kind === 'tick') {
    if (now - lastTickAt < TICK_GAP_MS || now < busyUntil) return;
    lastTickAt = now;
  }
  if (way === 'ios-switch') {
    if (IOS_KINDS.has(kind)) iosSwitchTick();
    return;
  }
  // 페이지를 한 번도 누르지 않았으면 브라우저가 막고 콘솔에 경고를 남기므로 부르지 않는다
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const pattern = HAPTIC_PATTERNS[kind];
  navigator.vibrate([...pattern]);
  busyUntil = now + pattern.reduce((sum, ms) => sum + ms, 0);
}

/** 아이폰: 숨긴 스위치의 label을 코드로 눌러 '톡'을 낸다(처음 부를 때 만든다). iOS 26.5부터는 울리지 않는다 */
export function iosSwitchTick(): void {
  if (!iosLabel || !iosLabel.isConnected) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = SWITCH_ID;
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.display = 'none';
    const label = document.createElement('label');
    label.htmlFor = SWITCH_ID;
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    document.body.append(input, label);
    iosLabel = label;
  }
  iosLabel.click();
}
