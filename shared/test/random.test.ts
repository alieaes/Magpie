import { describe, expect, it } from 'vitest';
import { SeededRandom, randomSeed } from '../src/random';

/** 시드로 처음 n개 값을 뽑는다 */
function take(seed: string, n: number): number[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('SeededRandom', () => {
  it('같은 시드면 같은 수열', () => {
    expect(take('9f3c0a7e', 20)).toEqual(take('9f3c0a7e', 20));
  });

  it('시드가 다르면 다른 수열', () => {
    expect(take('seed-a', 5)).not.toEqual(take('seed-b', 5));
  });

  it('수열이 바뀌지 않는다 (바뀌면 예전 판의 재계산 점수가 달라진다)', () => {
    // 이 값이 바뀌었다면 난수 알고리즘이 바뀐 것이다. 저장된 판이 있는 한 바꾸면 안 된다
    expect(take('magpie', 4)).toMatchInlineSnapshot(`
      [
        1636845093,
        1535740805,
        3523406199,
        1773161540,
      ]
    `);
  });

  it('부호 없는 32비트 정수만 나온다', () => {
    for (const v of take('range', 1000)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });

  it('int(min, max)는 양 끝을 포함한다', () => {
    const rng = new SeededRandom('dice');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const v = rng.int(1, 9);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
      seen.add(v);
    }
    expect(seen.size).toBe(9);
  });
});

describe('randomSeed', () => {
  it('16진 32자이고 매번 다르다', () => {
    const a = randomSeed();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSeed()).not.toBe(a);
  });
});
