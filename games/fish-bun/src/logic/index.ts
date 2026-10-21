// 붕어빵 가게 로직 진입점. 서버는 '@magpie/game-fish-bun/logic'으로 이 파일을 가져가 fishBunLogic으로 하루를 다시 계산한다.
// 화면(scene)은 zod가 게임 번들에 들어가지 않도록 규칙 파일(rules.ts)을 바로 가져간다.

import { z } from 'zod';
import type { GrowthLogic } from '@magpie/shared';
import { DAY_TICKS, MAX_INPUTS, MAX_SCORE, OP, applyShopAction, initialShopState, replayDay, UPGRADE_KEYS, UPGRADES, type FishInput, type ShopAction, type ShopState, type UpgradeKey } from './rules';

export * from './rules';

/** 입력 기록 형식: [틱, 동작, 값]. 값의 앞뒤(틱 순서, 돈, 빵틀 상태)는 replayDay가 본다 */
const inputSchema = z
  .array(z.tuple([z.int().min(0).max(DAY_TICKS), z.int().min(OP.tap).max(OP.trash), z.int().min(0).max(255)]))
  .max(MAX_INPUTS);

const count = z.int().min(0);

/** 강화 단계 (각 항목의 최대 단계 안) */
const upgradesSchema = z.object(
  Object.fromEntries(UPGRADE_KEYS.map((key) => [key, z.int().min(0).max(UPGRADES[key].max)])) as Record<UpgradeKey, z.ZodInt>,
);

/** 저장 상태 형식 (v1) */
const stateSchema = z.object({
  v: z.literal(1),
  day: z.int().min(1),
  money: count,
  reputation: count,
  upgrades: upgradesSchema,
  stats: z.object({ revenue: count, sold: count, golden: count, bestProfit: z.int(), maxCombo: count }),
});

const actionSchema = z.object({ op: z.literal('upgrade'), key: z.enum(UPGRADE_KEYS as [UpgradeKey, ...UpgradeKey[]]) });

/** 서버가 하루를 다시 돌리고 가게 행동을 확인할 때 쓰는 붕어빵 가게 로직 */
export const fishBunLogic: GrowthLogic<ShopState, FishInput, ShopAction> = {
  kind: 'growth',
  maxTicks: DAY_TICKS,
  maxScore: MAX_SCORE,
  inputSchema,
  stateSchema,
  initialState: initialShopState,
  replayDay(seed, inputs, state) {
    const result = replayDay(seed, inputs, state);
    if (!result.ok) return result;
    return { ok: true, score: result.score, ticks: result.ticks, nextState: result.nextState };
  },
  actionSchema,
  applyAction: applyShopAction,
  dayOf: (state) => state.day,
};
