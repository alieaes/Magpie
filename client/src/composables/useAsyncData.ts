import { ref, shallowRef, watch, type WatchSource } from 'vue';

/**
 * 비동기로 데이터를 불러오고 불러오는 중·실패 상태를 같이 들고 있는다.
 * deps가 바뀌면 다시 불러온다. 늦게 도착한 이전 응답은 버린다.
 */
export function useAsyncData<T>(load: () => Promise<T>, deps: WatchSource[] = []) {
  const data = shallowRef<T | null>(null);
  const loading = ref(true);
  const error = shallowRef<unknown>(null);
  let requestId = 0;

  /** 지금 조건으로 다시 불러온다 */
  async function reload(): Promise<void> {
    const id = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      const value = await load();
      if (id === requestId) data.value = value;
    } catch (err) {
      if (id === requestId) error.value = err;
    } finally {
      if (id === requestId) loading.value = false;
    }
  }

  watch(deps, () => void reload(), { immediate: true });
  return { data, loading, error, reload };
}
