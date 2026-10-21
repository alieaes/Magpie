// 게임 로직이 서버에 내놓는 것. 서버는 이것만으로 판을 다시 돌려 점수를 확인한다.
// 근거: docs/design/261006-08-play-submission.md §2, 성장형은 docs/design/261021-04-game-save.md §4-2

import type { ZodType } from 'zod';

/** 입력 기록을 처음부터 다시 돌린 결과. 실패하면 사유와 몇 번째 입력에서 걸렸는지 */
export type ReplayResult = { ok: true; score: number; ticks: number } | { ok: false; reason: string; index: number };

/** 미니게임 하나의 로직 (`games/<id>/logic`). Phaser를 모르는 순수 TypeScript다 */
export interface GameLogic<Input = unknown> {
  kind?: 'minigame';
  /** 한 판 최대 틱 수 */
  maxTicks: number;
  /** 이론상 최고 점수 */
  maxScore: number;
  /** 입력 기록 형식. 서버가 재계산 전에 먼저 검사한다. 입력 개수 상한도 여기서 막는다 */
  inputSchema: ZodType<Input[]>;
  /** 입력을 처음부터 다시 적용해 점수와 마지막 입력의 틱을 낸다. 규칙에 안 맞는 입력이 있으면 실패 */
  replay(seed: string, inputs: readonly Input[]): ReplayResult;
}

/** 성장형 하루를 다시 돌린 결과. 통과하면 다음 날 저장 상태도 낸다 */
export type DayReplayResult<State = unknown> =
  | { ok: true; score: number; ticks: number; nextState: State }
  | { ok: false; reason: string; index: number };

/** 가게 행동(강화 구매 등)을 적용한 결과 */
export type ActionResult<State = unknown> = { ok: true; state: State } | { ok: false; reason: string };

/**
 * 성장형 게임 하나의 로직. 판(하루) 사이에 저장 상태가 남는다.
 * 저장은 하루 결과(replayDay)와 가게 행동(applyAction)으로만 바뀐다.
 */
export interface GrowthLogic<State = unknown, Input = unknown, Action = unknown> {
  kind: 'growth';
  /** 하루 최대 틱 수 */
  maxTicks: number;
  /** 하루 점수의 이론상 최고값 */
  maxScore: number;
  /** 하루 입력 기록 형식 */
  inputSchema: ZodType<Input[]>;
  /** 저장 상태 형식. 저장 데이터에 형식 버전을 넣는다 */
  stateSchema: ZodType<State>;
  /** 시작 상태 */
  initialState(): State;
  /** 예전 형식 버전의 저장을 지금 형식으로 고친다. 없으면 그대로 쓴다 */
  migrate?(data: unknown): unknown;
  /** 그날 아침 상태에서 하루를 다시 돌려 점수와 다음 날 상태를 낸다 */
  replayDay(seed: string, inputs: readonly Input[], state: State): DayReplayResult<State>;
  /** 가게 행동 형식 */
  actionSchema: ZodType<Action>;
  /** 가게 행동을 적용한다. 규칙에 안 맞으면 사유와 함께 실패 */
  applyAction(state: State, action: Action): ActionResult<State>;
  /** 저장 상태가 몇 일째인지. 로비 카드에 보여 준다 */
  dayOf(state: State): number;
}

/** 서버에 등록하는 게임 로직: 미니게임 또는 성장형 */
export type AnyGameLogic = GameLogic | GrowthLogic;

/** 성장형 로직인지 */
export function isGrowthLogic(logic: AnyGameLogic): logic is GrowthLogic {
  return logic.kind === 'growth';
}
