import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

/**
 * 목표 시각(ISO 문자열)까지 남은 밀리초를 30초마다 갱신한다.
 * 목표 시각이 지나면 onReach를 한 번 부른다 (일간 랭킹이 새로 시작할 때 다시 불러오는 용도).
 */
export function useCountdown(target: MaybeRefOrGetter<string | undefined>, onReach?: () => void) {
  const remaining = ref<number | null>(null);
  let reached = false;

  /** 남은 시간을 다시 계산한다 */
  function tick(): void {
    const iso = toValue(target);
    if (!iso) {
      remaining.value = null;
      return;
    }
    const ms = new Date(iso).getTime() - Date.now();
    remaining.value = Math.max(0, ms);
    if (ms <= 0 && !reached) {
      reached = true;
      onReach?.();
    }
  }

  watch(
    () => toValue(target),
    () => {
      reached = false;
      tick();
    },
    { immediate: true },
  );
  const timer = setInterval(tick, 30_000);
  onBeforeUnmount(() => clearInterval(timer));
  return remaining;
}
