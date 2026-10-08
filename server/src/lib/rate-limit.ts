/**
 * 키(유저 등)마다 정해진 시간 안의 요청 횟수를 센다. 프로세스마다 따로 있다 (Redis 없이 간다).
 * 지난 windowMs 동안의 요청 시각을 기억하는 방식이라 경계에서 두 배가 몰리지 않는다.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 요청 한 번을 센다. 한도 안이면 true, 넘었으면 false (넘은 요청은 세지 않는다) */
  hit(key: string): boolean {
    const t = this.now();
    this.sweep(t);
    const recent = (this.hits.get(key) ?? []).filter((at) => at > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  /** 시간 창이 지난 키를 가끔 지운다. 한 번 오고 다시 안 오는 유저가 메모리에 쌓이지 않게 한다 */
  private sweep(t: number): void {
    if (t - this.lastSweep < this.windowMs) return;
    this.lastSweep = t;
    for (const [key, times] of this.hits) {
      if ((times.at(-1) ?? 0) <= t - this.windowMs) this.hits.delete(key);
    }
  }
}
