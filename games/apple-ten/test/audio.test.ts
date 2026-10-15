import { describe, expect, it } from 'vitest';
import { END_NOTES, LOOP_STEPS, midiToFreq, notesAt, popNotes, stepSeconds, volumeGain } from '../src/audio/music';

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

  it('음량 곡선은 0~1로 제한되고 단조 증가한다', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(2)).toBe(1);
    expect(volumeGain(-1)).toBe(0);
    expect(volumeGain(0.5)).toBeLessThan(volumeGain(0.8));
  });

  it('종료음은 올라가는 음이다', () => {
    const midis = END_NOTES.map((n) => n.midi);
    expect([...midis].sort((a, b) => a - b)).toEqual(midis);
  });
});
