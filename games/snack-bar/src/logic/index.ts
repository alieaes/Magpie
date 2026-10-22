// 분식집 로직 진입점. 서버는 '@magpie/game-snack-bar/logic'으로 이 파일을 가져가 snackBarLogic으로 하루를 다시 계산한다.
// 화면(scene)은 zod가 게임 번들에 들어가지 않도록 규칙 파일(rules.ts)을 바로 가져간다. 근거: docs/design/261022-09-snack-bar.md §9

import { z } from 'zod';
import type { GrowthLogic } from '@magpie/shared';
import {
  MAX_INPUTS,
  MAX_SCORE,
  MAX_TICKS,
  MENUS,
  OP,
  STAFF_IDS,
  UPGRADE_KEYS,
  applyShopAction,
  initialShopState,
  replayDay,
  upgradeMax,
  type ShopAction,
  type ShopState,
  type SnackInput,
  type StaffId,
  type UpgradeKey,
} from './rules';

export * from './rules';

/** 입력 기록 형식: [틱, 동작, 값]. 값의 앞뒤(틱 순서, 걷는 중인지, 쟁반 칸)는 replayDay가 본다 */
const inputSchema = z
  .array(z.tuple([z.int().min(0).max(MAX_TICKS), z.int().min(OP.move).max(OP.give), z.int().min(0).max(5)]))
  .max(MAX_INPUTS);

const count = z.int().min(0);
const staffId = z.enum(STAFF_IDS as unknown as [StaffId, ...StaffId[]]);

/** 강화 단계 (각 항목의 최대 단계 안) */
const upgradesSchema = z.object(
  Object.fromEntries(UPGRADE_KEYS.map((key) => [key, z.int().min(0).max(upgradeMax(key))])) as Record<UpgradeKey, z.ZodInt>,
);

/** 저장 상태 형식 (v1) */
const stateSchema = z.object({
  v: z.literal(1),
  day: z.int().min(1),
  money: count,
  exp: count,
  sold: z.array(count).length(MENUS.length),
  upgrades: upgradesSchema,
  character: staffId,
  unlocked: z.array(staffId).min(1),
  stats: z.object({
    guests: count,
    best: count,
    angry: count,
    water: count,
    cleaned: count,
    bigGroups: count,
    revenue: count,
    bestProfit: z.int(),
  }),
});

const actionSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upgrade'), key: z.enum(UPGRADE_KEYS as unknown as [UpgradeKey, ...UpgradeKey[]]) }),
  z.object({ op: z.literal('pick'), id: staffId }),
]);

/** 서버가 하루를 다시 돌리고 가게 행동을 확인할 때 쓰는 분식집 로직 */
export const snackBarLogic: GrowthLogic<ShopState, SnackInput, ShopAction> = {
  kind: 'growth',
  maxTicks: MAX_TICKS,
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
