// 밸런스 확인: 흉내 플레이어로 여러 날을 돌려 설계 261021-03 §6의 목표에 맞는지 본다.
// 화면식 진행(지금 틱에 입력 적용)과 다시 돌리기(replayDay)가 같은 결과를 내는지도 본다.

import { describe, expect, it } from 'vitest';
import { initialShopState, levelOf, replayDay, settleDay } from '../src/logic';
import { AVERAGE, SKILLED, playDay, playDays, type DayLog } from './bot';

/** 기록을 표로 찍는다 (vitest --reporter=verbose에서 보인다) */
function print(title: string, logs: DayLog[]): void {
  const rows = logs.map(
    (l) =>
      `${String(l.day).padStart(3)}일 수익 ${String(l.profit).padStart(6)} 돈 ${String(l.money).padStart(7)} 평판 ${String(l.reputation).padStart(5)}(Lv${levelOf(l.reputation)}) 빵틀 ${String(l.molds).padStart(2)} 손님 ${l.served}/${l.customers} 떠남 ${l.left} 황금 ${l.golden} 메뉴 ${l.soldBy.join('/')} 깨짐 ${l.broken} ${l.bought.join(',')}`,
  );
  console.log(`--- ${title}\n${rows.join('\n')}`);
}

describe('흉내 플레이어', () => {
  it('화면처럼 진행한 하루와 다시 돌린 하루가 같다', () => {
    // 팥만 열린 가게와 세 메뉴가 다 열린 가게(평판 Lv5)
    const shops = [initialShopState(), { ...initialShopState(), reputation: 280 }];
    for (const [seed, shop] of shops.flatMap((s) => ['bot-a', 'bot-b', 'bot-c'].map((seed) => [seed, s] as const))) {
      const { inputs, sim } = playDay(shop, seed, SKILLED);
      const live = settleDay(sim);
      const replayed = replayDay(seed, inputs, shop);
      expect(replayed.ok).toBe(true);
      if (!replayed.ok) return;
      expect(replayed.score).toBe(live.score);
      expect(replayed.nextState).toEqual(live.nextState);
      expect(inputs.length).toBeLessThan(6000);
    }
  });

  it('보통 실력: 1일째 수익 2,000~3,000원 안팎, 3일 안에 빵틀 9칸, 10일 무렵 12칸', () => {
    const logs = playDays(30, AVERAGE, 'avg');
    print('보통 실력', logs);
    expect(logs[0]!.profit).toBeGreaterThan(1500);
    expect(logs[0]!.profit).toBeLessThan(3500);
    expect(logs.findIndex((l) => l.molds >= 9)).toBeLessThanOrEqual(3);
    const twelve = logs.findIndex((l) => l.molds >= 12);
    expect(twelve).toBeGreaterThan(4);
    expect(twelve).toBeLessThanOrEqual(13);
    // 메뉴 늘리기(설계 261022-02 §6): 슈크림·피자가 열리면 팔리고, 피자가 열린 뒤 하루 수익이 오른다
    expect(logs.some((l) => l.soldBy[1]! > 0)).toBe(true);
    expect(logs.some((l) => l.soldBy[2]! > 0)).toBe(true);
    const pizzaDay = logs.findIndex((l) => l.soldBy[2]! > 0);
    const avg = (ls: DayLog[]) => ls.reduce((s, l) => s + l.profit, 0) / ls.length;
    expect(avg(logs.slice(pizzaDay, pizzaDay + 5))).toBeGreaterThan(avg(logs.slice(Math.max(0, pizzaDay - 5), pizzaDay)));
  });

  it('잘하는 실력은 보통보다 더 번다', () => {
    const avg = playDays(10, AVERAGE, 'cmp');
    const good = playDays(10, SKILLED, 'cmp');
    print('잘하는 실력', good);
    const sum = (logs: DayLog[]) => logs.reduce((s, l) => s + l.profit, 0);
    expect(sum(good)).toBeGreaterThan(sum(avg));
  });
});
