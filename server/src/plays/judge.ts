// 끝난 판을 검사한다: 형식 → 시간 → 재계산 → 점수. 하나라도 걸리면 거절한다.
// 근거: docs/design/261006-08-play-submission.md §4

import { TICKS_PER_SECOND, type FinishPlayRequest, type GameLogic, type PlayRejectReason } from '@magpie/shared';
import type { ReplayRunner } from './replay-runner';

/** 시간 허용 폭: 실제 경과 시간과 게임 시간(틱 / 60)의 차이가 5초 + 게임 시간의 10% 안이어야 한다. 튜닝값 */
export const TIME_SLACK_SECONDS = 5;
export const TIME_SLACK_RATIO = 0.1;

export type Judgement =
  | { accepted: true; score: number }
  | { accepted: false; reason: Exclude<PlayRejectReason, 'abandoned'> };

export interface JudgeInput {
  gameId: string;
  logic: GameLogic;
  seed: string;
  /** 서버가 판을 연 시각 */
  startedAt: Date;
  /** 서버가 끝 요청을 받은 시각 */
  finishedAt: Date;
  submission: FinishPlayRequest;
  runner: ReplayRunner;
}

/** 판을 검사해 통과(서버가 낸 점수) 또는 거절(사유)을 돌려준다 */
export async function judgePlay({ gameId, logic, seed, startedAt, finishedAt, submission, runner }: JudgeInput): Promise<Judgement> {
  const parsed = logic.inputSchema.safeParse(submission.inputs);
  if (!parsed.success) return { accepted: false, reason: 'bad_input' };

  if (!isTimePlausible(submission.ticks, logic.maxTicks, startedAt, finishedAt)) return { accepted: false, reason: 'time' };

  const result = await runner.replay(gameId, seed, parsed.data);
  // 판이 끝났다는 틱보다 뒤에 입력이 있으면 기록이 앞뒤가 안 맞는다
  if (!result.ok || result.ticks > submission.ticks) return { accepted: false, reason: 'bad_input' };

  if (result.score !== submission.score || result.score > logic.maxScore) return { accepted: false, reason: 'mismatch' };
  return { accepted: true, score: result.score };
}

/**
 * 게임 시간이 그럴듯한지 본다. 최대 틱을 넘거나, 실제로 흐른 시간보다 틱이 훨씬 많거나(게임 시계를 빠르게 돌림)
 * 훨씬 적으면(멈추고 생각함) false. 실제 시간에는 판을 여는 요청과 끝 요청의 네트워크 시간이 들어간다.
 */
export function isTimePlausible(ticks: number, maxTicks: number, startedAt: Date, finishedAt: Date): boolean {
  if (ticks > maxTicks) return false;
  const gameSeconds = ticks / TICKS_PER_SECOND;
  const realSeconds = (finishedAt.getTime() - startedAt.getTime()) / 1000;
  return Math.abs(realSeconds - gameSeconds) <= TIME_SLACK_SECONDS + TIME_SLACK_RATIO * gameSeconds;
}
