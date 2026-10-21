// 성장형 저장 흐름을 시험하는 작은 가게 로직. 실제 성장형 게임(붕어빵 가게)이 들어오기 전에 공통 구조를 확인한다.
// 하루 동안 "벌기" 입력을 받고, 번 돈으로 "강화"를 산다. 강화 단계가 오를수록 같은 입력으로 더 번다.

import { z } from 'zod';
import type { GrowthLogic } from '@magpie/shared';

export interface TestShopState {
  /** 저장 형식 버전 */
  v: 1;
  day: number;
  money: number;
  level: number;
}

export interface TestShopInput {
  t: number;
  /** 이번에 번 기본 금액(1~10). 강화 단계 + 1을 곱한다 */
  earn: number;
}

export interface TestShopAction {
  op: 'upgrade';
}

/** 하루 길이: 10초 */
export const TEST_DAY_TICKS = 600;

/** 강화 비용: 다음 단계마다 10원씩 오른다 */
export function upgradeCost(level: number): number {
  return 10 * (level + 1);
}

/** 시험용 성장형 로직 */
export const testShopLogic: GrowthLogic<TestShopState, TestShopInput, TestShopAction> = {
  kind: 'growth',
  maxTicks: TEST_DAY_TICKS,
  maxScore: 1_000_000,
  inputSchema: z.array(z.object({ t: z.int().min(0), earn: z.int().min(1).max(10) })).max(100),
  stateSchema: z.object({ v: z.literal(1), day: z.int().min(1), money: z.int().min(0), level: z.int().min(0) }),
  initialState: () => ({ v: 1, day: 1, money: 0, level: 0 }),

  /** 입력마다 번 돈을 더하고 다음 날로 넘긴다. 시드는 쓰지 않는다 */
  replayDay(_seed, inputs, state) {
    let last = 0;
    let earned = 0;
    for (const [index, input] of inputs.entries()) {
      if (input.t < last || input.t > TEST_DAY_TICKS) return { ok: false, reason: 'bad_tick', index };
      last = input.t;
      earned += input.earn * (state.level + 1);
    }
    return { ok: true, score: earned, ticks: last, nextState: { ...state, day: state.day + 1, money: state.money + earned } };
  },

  actionSchema: z.object({ op: z.literal('upgrade') }),

  /** 돈이 있으면 강화 단계를 올린다 */
  applyAction(state) {
    const cost = upgradeCost(state.level);
    if (state.money < cost) return { ok: false, reason: 'no_money' };
    return { ok: true, state: { ...state, money: state.money - cost, level: state.level + 1 } };
  },

  dayOf: (state) => state.day,
};
