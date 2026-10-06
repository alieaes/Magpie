/** 키마다 정해진 시간 동안 값을 기억하는 작은 메모리 캐시. 프로세스마다 따로 있다 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 살아 있는 값이 있으면 돌려주고, 없으면 load로 만들어 기억한 뒤 돌려준다 */
  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const value = await load();
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    this.prune();
    return value;
  }

  /** 만료된 값을 지운다. 일간 키가 날마다 바뀌어도 메모리가 쌓이지 않게 한다 */
  private prune(): void {
    const t = this.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= t) this.store.delete(key);
    }
  }
}
