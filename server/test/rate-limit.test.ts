import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/lib/rate-limit';

describe('RateLimiter', () => {
  it('시간 창 안에서는 한도까지만 받고, 창이 지나면 다시 받는다', () => {
    let t = 0;
    const limiter = new RateLimiter(3, 1000, () => t);
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, true, false]);
    // 다른 키는 따로 센다
    expect(limiter.hit('b')).toBe(true);
    t = 999;
    expect(limiter.hit('a')).toBe(false);
    t = 1000;
    expect(limiter.hit('a')).toBe(true);
  });

  it('창 경계에 몰아서 보내도 창 하나에 한도를 넘지 않는다', () => {
    let t = 0;
    const limiter = new RateLimiter(2, 1000, () => t);
    t = 900;
    expect([limiter.hit('a'), limiter.hit('a')]).toEqual([true, true]);
    t = 1100;
    expect(limiter.hit('a')).toBe(false);
    t = 1901;
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, false]);
  });
});
