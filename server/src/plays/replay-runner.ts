// 입력 기록 재계산을 돌리는 자리. 설계는 API 서버 안의 작업 스레드(worker_threads)다 (기술 스택 §3-3).
// 사과게임은 가벼워서 지금은 요청을 처리하면서 바로 돌린다. 무거운 게임이 들어오면 이 자리만 작업 스레드로 바꾼다.
// 그래서 로직 함수를 넘기지 않고 게임 id로 찾는다(작업 스레드에는 함수를 넘길 수 없다).

import { isGrowthLogic, type DayReplayResult, type ReplayResult } from '@magpie/shared';
import { defaultLogics, type LogicRegistry } from './logics';

export interface ReplayRunner {
  /** 그 게임의 로직으로 입력 기록을 처음부터 다시 돌린다 */
  replay(gameId: string, seed: string, inputs: readonly unknown[]): Promise<ReplayResult>;
  /** 성장형: 그날 아침 저장 상태에서 하루를 다시 돌린다 */
  replayDay(gameId: string, seed: string, inputs: readonly unknown[], state: unknown): Promise<DayReplayResult>;
}

/** 요청을 처리하는 스레드에서 바로 돌리는 재계산을 만든다 */
export function createInlineRunner(logics: LogicRegistry): ReplayRunner {
  return {
    /** 미니게임 로직을 찾아 그대로 부른다 */
    async replay(gameId, seed, inputs) {
      const logic = logics.find(gameId);
      if (!logic || isGrowthLogic(logic)) throw new Error(`재계산할 미니게임 로직이 없다: ${gameId}`);
      return logic.replay(seed, inputs);
    },
    /** 성장형 로직을 찾아 그날을 다시 돌린다 */
    async replayDay(gameId, seed, inputs, state) {
      const logic = logics.find(gameId);
      if (!logic || !isGrowthLogic(logic)) throw new Error(`재계산할 성장형 로직이 없다: ${gameId}`);
      return logic.replayDay(seed, inputs, state);
    },
  };
}

/** 실제 게임 로직으로 바로 돌리는 재계산 */
export const inlineReplayRunner = createInlineRunner(defaultLogics);
