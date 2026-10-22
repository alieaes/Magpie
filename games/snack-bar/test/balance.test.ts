// 밸런스 확인: 흉내 플레이어로 여러 날을 돌려 설계 261022-10 §6의 목표에 맞는지 본다.
// 화면식 진행(지금 틱에 입력 적용)과 다시 돌리기(replayDay)가 같은 결과를 내는지도 본다.

import { describe, expect, it } from 'vitest';
import { initialShopState, replayDay, settleDay, MAX_INPUTS } from '../src/logic';
import { AVERAGE, SKILLED, playDay, playDays, type DayLog } from './bot';

/** 기록을 표로 찍는다 (vitest --reporter=verbose에서 보인다) */
function print(title: string, logs: DayLog[]): void {
  const rows = logs.map(
    (l) =>
      `${String(l.day).padStart(3)}일 수익 ${String(l.profit).padStart(7)} 돈 ${String(l.money).padStart(8)} Lv${l.level} ${l.staff.padEnd(7)} 테이블 ${l.tables} 쟁반 ${l.tray} 손님 ${String(l.guests).padStart(3)} 화남 ${l.angry} 돌아감 ${l.turnedAway} 마감 ${l.closingLeft} 메뉴 ${l.sold.join('/')} 직원 ${l.unlocked} ${l.bought.join(',')}`,
  );
  console.log(`--- ${title}\n${rows.join('\n')}`);
}

describe('흉내 플레이어', () => {
  it('화면처럼 진행한 하루와 다시 돌린 하루가 같다', () => {
    const later = { ...initialShopState(), exp: 2_000, sold: [120, 100, 40, 10, 0], upgrades: { ...initialShopState().upgrades, tables: 2, tray: 2 } };
    for (const shop of [initialShopState(), later]) {
      for (const seed of ['bot-a', 'bot-b', 'bot-c']) {
        const { inputs, sim } = playDay(shop, seed, SKILLED);
        const live = settleDay(sim);
        const replayed = replayDay(seed, inputs, shop);
        expect(replayed.ok).toBe(true);
        if (!replayed.ok) return;
        expect(replayed.score).toBe(live.score);
        expect(replayed.nextState).toEqual(live.nextState);
        expect(inputs.length).toBeLessThan(MAX_INPUTS);
      }
    }
  });

  it('30일 밸런스 (보통 실력)', () => {
    const logs = playDays(30, AVERAGE, 'avg');
    print('보통 실력', logs);
    expect(logs.length).toBe(30);
  });

  it('잘하는 실력은 보통보다 더 번다', () => {
    const avg = playDays(10, AVERAGE, 'cmp');
    const good = playDays(10, SKILLED, 'cmp');
    print('잘하는 실력', good);
    const sum = (logs: DayLog[]) => logs.reduce((s, l) => s + l.profit, 0);
    expect(sum(good)).toBeGreaterThan(sum(avg));
  });
});
