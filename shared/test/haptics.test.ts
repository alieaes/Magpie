import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectHapticSupport } from '../src/haptics';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
/** iOS Safari UA. os는 UA의 OS 자리, safari는 Version/ 자리 */
const iphone = (os: string, safari: string) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safari} Mobile/15E148 Safari/604.1`;
/** iOS 크롬 UA (Version/ 자리 없음) */
const iphoneChrome = (os: string) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1`;
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

describe('detectHapticSupport', () => {
  it('안드로이드 폰은 vibrate', () => {
    expect(detectHapticSupport({ userAgent: ANDROID, hasVibrate: true, coarsePointer: true })).toBe('vibrate');
  });

  it('PC 크롬은 vibrate가 있어도 none (손가락 입력이 아님)', () => {
    expect(detectHapticSupport({ userAgent: DESKTOP, hasVibrate: true, coarsePointer: false })).toBe('none');
  });

  it('vibrate가 없는 브라우저(파이어폭스 안드로이드 등)는 none', () => {
    expect(detectHapticSupport({ userAgent: ANDROID, hasVibrate: false, coarsePointer: true })).toBe('none');
  });

  it('아이폰은 Safari 17.4 ~ 26.4만 ios-switch', () => {
    const at = (os: string, safari: string) => detectHapticSupport({ userAgent: iphone(os, safari), hasVibrate: false, coarsePointer: true });
    expect(at('17_3', '17.3')).toBe('none');
    expect(at('17_4', '17.4')).toBe('ios-switch');
    expect(at('18_6', '18.6')).toBe('ios-switch');
    expect(at('18_6', '26.4')).toBe('ios-switch');
    expect(at('18_6', '26.5')).toBe('none');
    expect(at('18_6', '27.0')).toBe('none');
    expect(at('18_6', '26')).toBe('ios-switch');
  });

  it('Safari 버전이 없는 아이폰 UA는 OS 자리가 17.x일 때만 믿는다', () => {
    const at = (os: string) => detectHapticSupport({ userAgent: iphoneChrome(os), hasVibrate: false, coarsePointer: true });
    expect(at('17_5')).toBe('ios-switch');
    expect(at('17_2')).toBe('none');
    expect(at('18_6')).toBe('none');
  });

  it('아이패드는 진동 장치가 없어 none', () => {
    expect(detectHapticSupport({ userAgent: IPAD, hasVibrate: false, coarsePointer: true })).toBe('none');
  });
});

describe('haptic', () => {
  let now = 1000;
  let store: Map<string, string>;
  let vibrate: ReturnType<typeof vi.fn>;
  let labelClicks = 0;

  /** 가짜 브라우저를 깔고 모듈 상태(기기 판단·설정 캐시)를 새로 받는다 */
  async function load(userAgent = ANDROID, opts: { hasBeenActive?: boolean; storageThrows?: boolean } = {}) {
    vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', {
      userAgent,
      ...(userAgent.includes('iPhone') ? {} : { vibrate }),
      userActivation: { hasBeenActive: opts.hasBeenActive ?? true },
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal(
      'localStorage',
      opts.storageThrows
        ? {
            getItem: () => {
              throw new Error('blocked');
            },
            setItem: () => {
              throw new Error('blocked');
            },
          }
        : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    );
    vi.stubGlobal('document', {
      createElement: (tag: string) => ({
        style: {},
        isConnected: true,
        setAttribute: () => undefined,
        click: () => {
          if (tag === 'label') labelClicks += 1;
        },
      }),
      body: { append: () => undefined },
    });
    vi.resetModules();
    return import('../src/haptics');
  }

  beforeEach(() => {
    now = 1000;
    store = new Map();
    labelClicks = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('안드로이드는 종류별 패턴으로 울린다', async () => {
    const h = await load();
    h.haptic('tap');
    now += 1000;
    h.haptic('great');
    expect(vibrate.mock.calls).toEqual([[[12]], [[30, 40, 30, 40, 90]]]);
  });

  it('tick은 40ms에 한 번까지', async () => {
    const h = await load();
    h.haptic('tick');
    now += 20;
    h.haptic('tick');
    now += 25;
    h.haptic('tick');
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('긴 패턴이 도는 동안 온 tick은 건너뛴다 (tap 같은 다른 종류는 울린다)', async () => {
    const h = await load();
    h.haptic('good');
    now += 60;
    h.haptic('tick');
    now += 1;
    h.haptic('tap');
    now += 200;
    h.haptic('tick');
    expect(vibrate.mock.calls).toEqual([[[20, 50, 35]], [[12]], [[8]]]);
  });

  it('페이지를 아직 누르지 않았으면 부르지 않는다', async () => {
    const h = await load(ANDROID, { hasBeenActive: false });
    h.haptic('tap');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('끄면 울리지 않고, 저장해서 다음에도 꺼져 있다', async () => {
    let h = await load();
    const seen: boolean[] = [];
    h.onHapticsChange((on) => seen.push(on));
    expect(h.hapticsEnabled()).toBe(true);
    h.setHapticsEnabled(false);
    h.haptic('tap');
    expect(vibrate).not.toHaveBeenCalled();
    expect(seen).toEqual([false]);
    expect(store.get('magpie.haptics')).toBe('0');

    h = await load();
    expect(h.hapticsEnabled()).toBe(false);
  });

  it('저장소를 못 쓰면 켜짐으로 치고 바꿔도 터지지 않는다', async () => {
    const h = await load(ANDROID, { storageThrows: true });
    expect(h.hapticsEnabled()).toBe(true);
    expect(() => h.setHapticsEnabled(false)).not.toThrow();
    expect(h.hapticsEnabled()).toBe(false);
  });

  it('아이폰(26.4 이하)은 성공 쪽만 스위치를 누르고, 실패 쪽·tick은 울리지 않는다', async () => {
    const h = await load(iphone('18_6', '26.4'));
    expect(h.hapticSupport()).toBe('ios-switch');
    for (const kind of ['tap', 'tick', 'deny', 'good', 'great', 'thud'] as const) {
      now += 1000;
      h.haptic(kind);
    }
    expect(labelClicks).toBe(3);
  });

  it('지원하지 않는 기기는 아무것도 하지 않는다', async () => {
    const h = await load(iphone('18_6', '26.5'));
    expect(h.hapticSupport()).toBe('none');
    h.haptic('tap');
    expect(labelClicks).toBe(0);
  });
});
