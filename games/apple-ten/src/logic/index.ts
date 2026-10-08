// 사과게임 로직 진입점. 서버는 '@magpie/game-apple-ten/logic'으로 이 파일을 가져가 appleTenLogic으로 점수를 다시 계산한다.
// 화면(scene)은 zod가 게임 번들에 들어가지 않도록 규칙 파일(rules.ts)을 바로 가져간다.

import { z } from 'zod';
import type { GameLogic } from '@magpie/shared';
import { MAX_INPUTS, MAX_SCORE, TIME_LIMIT_TICKS, replay, type AppleInput } from './rules';

export * from './rules';

/** 입력 기록 형식. 값의 범위(판 안, 틱 순서)는 replay가 본다 */
const inputSchema = z
  .array(
    z.object({
      t: z.int().min(0),
      c1: z.int().min(0),
      r1: z.int().min(0),
      c2: z.int().min(0),
      r2: z.int().min(0),
    }),
  )
  .max(MAX_INPUTS);

/** 서버가 판을 다시 돌릴 때 쓰는 사과게임 로직 */
export const appleTenLogic: GameLogic<AppleInput> = {
  maxTicks: TIME_LIMIT_TICKS,
  maxScore: MAX_SCORE,
  inputSchema,
  replay,
};
