import { describe, expect, it } from 'vitest';
import { kstDayKey, kstDayStart, nextKstMidnight } from '../src/time';
import { rankToPoints } from '../src/ranking';

describe('KST 날짜', () => {
  it('UTC 15:00이 KST 다음 날 00:00이다', () => {
    expect(kstDayKey(new Date('2026-10-06T14:59:59.999Z'))).toBe('2026-10-06');
    expect(kstDayKey(new Date('2026-10-06T15:00:00.000Z'))).toBe('2026-10-07');
  });

  it('다음 KST 자정을 UTC로 준다', () => {
    expect(nextKstMidnight(new Date('2026-10-06T03:00:00Z')).toISOString()).toBe('2026-10-06T15:00:00.000Z');
    // 정확히 자정이면 그다음 자정이다
    expect(nextKstMidnight(new Date('2026-10-06T15:00:00Z')).toISOString()).toBe('2026-10-07T15:00:00.000Z');
  });

  it('KST 날짜의 시작 시각을 UTC로 준다', () => {
    expect(kstDayStart('2026-10-07').toISOString()).toBe('2026-10-06T15:00:00.000Z');
  });
});

describe('총합 환산점', () => {
  it('1위는 1000점, 순위가 내려갈수록 깎인다', () => {
    expect([1, 2, 3, 4].map((r) => rankToPoints(r, 4))).toEqual([1000, 750, 500, 250]);
  });

  it('혼자면 1000점', () => {
    expect(rankToPoints(1, 1)).toBe(1000);
  });

  it('반올림한다', () => {
    expect(rankToPoints(2, 3)).toBe(667);
    expect(rankToPoints(3, 3)).toBe(333);
  });
});
