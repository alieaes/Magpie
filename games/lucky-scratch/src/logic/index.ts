// 복권 긁기 로직 진입점. 서버는 '@magpie/game-lucky-scratch/logic'으로 이 파일을 가져가 luckyScratchLogic으로 점수를 다시 계산한다.
// 화면(scene)은 zod가 게임 번들에 들어가지 않도록 규칙 파일(rules.ts)을 바로 가져간다.

import { z } from 'zod';
import type { GameLogic } from '@magpie/shared';
import { MAX_BUY, MAX_INPUTS, MAX_SCORE, TIME_LIMIT_TICKS, replay, type LotteryInput } from './rules';

export * from './rules';

/** 입력 기록 형식. 값의 앞뒤(틱 순서, 소지금, 남은 복권)는 replay가 본다 */
const inputSchema = z
  .array(
    z.discriminatedUnion('op', [
      z.object({ t: z.int().min(0), op: z.literal('scratch') }),
      z.object({ t: z.int().min(0), op: z.literal('buy'), count: z.int().min(1).max(MAX_BUY) }),
    ]),
  )
  .max(MAX_INPUTS);

/** 서버가 판을 다시 돌릴 때 쓰는 복권 긁기 로직 */
export const luckyScratchLogic: GameLogic<LotteryInput> = {
  maxTicks: TIME_LIMIT_TICKS,
  maxScore: MAX_SCORE,
  inputSchema,
  replay,
};
