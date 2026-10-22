// 게임 소리 끄기·음량. 다음 판에도 유지하려고 브라우저에 저장한다 (저장소를 못 쓰면 기본값).
// 미니게임·성장형 플레이 화면이 같이 쓴다. 근거: docs/design/261016-01-apple-sound.md

import { ref } from 'vue';

const MUTE_KEY = 'magpie.muted';
const VOLUME_KEY = 'magpie.volume';
/** 처음 음량(0~100) */
const DEFAULT_VOLUME = 70;

/** 소리를 바꿀 수 있는 띄운 게임 (소리가 없는 게임은 메서드가 없다) */
export interface SoundTarget {
  setMuted?(muted: boolean): void;
  setVolume?(volume: number): void;
}

/** 저장해 둔 음소거 여부 */
function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 저장해 둔 음량(0~100) */
function readVolume(): number {
  try {
    const saved = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && saved >= 0 && saved <= 100 ? saved : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** 값을 브라우저에 저장한다. 저장 실패는 무시한다 */
function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 실패는 무시한다
  }
}

/** 소리 상태와 바꾸는 함수. attach로 띄운 게임을 붙이면 바꿀 때마다 게임에 알린다 */
export function useSound() {
  const muted = ref(readMuted());
  const volume = ref(readVolume());
  let target: SoundTarget | null = null;

  /** 소리를 받을 게임을 붙인다. 게임을 내렸으면 null */
  function attach(next: SoundTarget | null): void {
    target = next;
  }

  /** 음량 슬라이더. 0으로 내리면 음소거, 올리면 음소거를 푼다 */
  function onVolume(): void {
    target?.setVolume?.(volume.value / 100);
    if (muted.value !== (volume.value === 0)) {
      muted.value = volume.value === 0;
      target?.setMuted?.(muted.value);
    }
    store(VOLUME_KEY, String(volume.value));
    store(MUTE_KEY, muted.value ? '1' : '0');
  }

  /** 소리 켜기/끄기 버튼 */
  function toggleMuted(): void {
    muted.value = !muted.value;
    target?.setMuted?.(muted.value);
    store(MUTE_KEY, muted.value ? '1' : '0');
  }

  /** 게임 안 설정에서 바꾼 값을 받아 저장한다(게임은 이미 그 값이라 다시 알리지 않는다). 음량은 0~1 */
  function setFromGame(nextMuted: boolean, nextVolume: number): void {
    muted.value = nextMuted;
    volume.value = Math.round(Math.min(1, Math.max(0, nextVolume)) * 100);
    store(VOLUME_KEY, String(volume.value));
    store(MUTE_KEY, muted.value ? '1' : '0');
  }

  return { muted, volume, attach, onVolume, toggleMuted, setFromGame };
}
