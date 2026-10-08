// 게임 로직이 서버에 내놓는 것. 서버는 이것만으로 판을 다시 돌려 점수를 확인한다.
// 근거: docs/design/261006-08-play-submission.md §2

import type { ZodType } from 'zod';

/** 입력 기록을 처음부터 다시 돌린 결과. 실패하면 사유와 몇 번째 입력에서 걸렸는지 */
export type ReplayResult = { ok: true; score: number; ticks: number } | { ok: false; reason: string; index: number };

/** 게임 하나의 로직 (`games/<id>/logic`). Phaser를 모르는 순수 TypeScript다 */
export interface GameLogic<Input = unknown> {
  /** 한 판 최대 틱 수 */
  maxTicks: number;
  /** 이론상 최고 점수 */
  maxScore: number;
  /** 입력 기록 형식. 서버가 재계산 전에 먼저 검사한다. 입력 개수 상한도 여기서 막는다 */
  inputSchema: ZodType<Input[]>;
  /** 입력을 처음부터 다시 적용해 점수와 마지막 입력의 틱을 낸다. 규칙에 안 맞는 입력이 있으면 실패 */
  replay(seed: string, inputs: readonly Input[]): ReplayResult;
}
