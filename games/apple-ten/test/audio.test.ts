import { describe, expect, it } from 'vitest';
import { LOOP_STEPS, midiToFreq, notesAt, popNotes, stepSeconds } from '../src/audio/music';

describe('사과게임 소리 악보', () => {
  it('가온 라는 440Hz, 한 옥타브 위는 두 배', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
  });

  it('곡은 LOOP_STEPS마다 되풀이된다', () => {
    for (const urgent of [false, true]) {
      for (let i = 0; i < LOOP_STEPS; i += 1) {
        expect(notesAt(i + LOOP_STEPS, urgent)).toEqual(notesAt(i, urgent));
      }
    }
  });

  it('긴박 모드는 더 빠르고 음이 높다', () => {
    expect(stepSeconds(true)).toBeLessThan(stepSeconds(false));
    const normal = notesAt(0, false).map((n) => n.midi);
    const urgent = notesAt(0, true).map((n) => n.midi);
    expect(urgent.map((m) => m - 2)).toEqual(normal);
  });

  it('곡 전체에 소리가 나는 스텝이 있다', () => {
    const sounding = Array.from({ length: LOOP_STEPS }, (_, i) => notesAt(i, false).length > 0);
    expect(sounding.filter(Boolean).length).toBeGreaterThan(LOOP_STEPS / 2);
  });

  it('많이 지울수록 터짐 소리가 높고 음이 많다', () => {
    const small = popNotes(2);
    const big = popNotes(10);
    expect(big[0]!.midi).toBeGreaterThan(small[0]!.midi);
    expect(big.length).toBeGreaterThan(small.length);
  });
});
