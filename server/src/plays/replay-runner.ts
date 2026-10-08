// 입력 기록 재계산을 돌리는 자리. 설계는 API 서버 안의 작업 스레드(worker_threads)다 (기술 스택 §3-3).
// 사과게임은 가벼워서 지금은 요청을 처리하면서 바로 돌린다. 무거운 게임이 들어오면 이 자리만 작업 스레드로 바꾼다.
// 그래서 로직 함수를 넘기지 않고 게임 id로 찾는다(작업 스레드에는 함수를 넘길 수 없다).

import type { ReplayResult } from '@magpie/shared';
import { findLogic } from './logics';

export interface ReplayRunner {
  /** 그 게임의 로직으로 입력 기록을 처음부터 다시 돌린다 */
  replay(gameId: string, seed: string, inputs: readonly unknown[]): Promise<ReplayResult>;
}

/** 요청을 처리하는 스레드에서 바로 돌리는 재계산 */
export const inlineReplayRunner: ReplayRunner = {
  /** 로직을 찾아 그대로 부른다 */
  async replay(gameId, seed, inputs) {
    const logic = findLogic(gameId);
    if (!logic) throw new Error(`재계산할 로직이 없다: ${gameId}`);
    return logic.replay(seed, inputs);
  },
};
