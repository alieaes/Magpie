// 판 검사 테스트. DB 없이 사과게임·복권 긁기 로직으로 형식·시간·재계산·점수 검사를 확인한다.

import { describe, expect, it } from 'vitest';
import { appleTenLogic } from '@magpie/game-apple-ten/logic';
import { drawTicket, luckyScratchLogic, type LotteryInput } from '@magpie/game-lucky-scratch/logic';
import type { FinishPlayRequest } from '@magpie/shared';
import { isTimePlausible, judgePlay } from '../src/plays/judge';
import { isRecordable } from '../src/plays/logics';
import { createInlineRunner, inlineReplayRunner } from '../src/plays/replay-runner';
import { testShopLogic, type TestShopState } from './growth-fixture';
import { GROWTH_TEST_GAME, playAppleGreedy, testLogics } from './helpers';

const START = new Date('2026-10-08T00:00:00Z');

/** 시작 시각에서 몇 초 뒤 */
function after(seconds: number): Date {
  return new Date(START.getTime() + seconds * 1000);
}

/** 사과게임 판 하나를 검사한다. 끝 요청은 기본으로 게임 시간 + 1초 뒤에 왔다고 본다 */
function judge(seed: string, submission: FinishPlayRequest, realSeconds = submission.ticks / 60 + 1) {
  return judgePlay({
    gameId: 'apple-ten',
    logic: appleTenLogic,
    seed,
    startedAt: START,
    finishedAt: after(realSeconds),
    submission,
    runner: inlineReplayRunner,
  });
}

describe('judgePlay', () => {
  const seed = 'judge-seed';
  const { inputs, score } = playAppleGreedy(seed, 20);
  const ticks = inputs.at(-1)!.t + 30;

  it('정상 기록은 통과하고 서버가 낸 점수를 준다', async () => {
    expect(await judge(seed, { inputs, ticks, score })).toEqual({ accepted: true, score });
  });

  it('입력이 없는 판은 0점으로 통과', async () => {
    expect(await judge(seed, { inputs: [], ticks: 600, score: 0 })).toEqual({ accepted: true, score: 0 });
  });

  it('형식이 틀리면 bad_input', async () => {
    expect(await judge(seed, { inputs: [{ t: 'x' }], ticks, score })).toEqual({ accepted: false, reason: 'bad_input' });
  });

  it('최대 틱을 넘거나 실제 시간과 크게 다르면 time', async () => {
    expect(await judge(seed, { inputs, ticks: 7201, score }, 121)).toEqual({ accepted: false, reason: 'time' });
    // 게임 시계를 빠르게 돌림: 2초 만에 120초짜리 판
    expect(await judge(seed, { inputs, ticks: 7200, score }, 2)).toEqual({ accepted: false, reason: 'time' });
    // 멈추고 생각함: 게임은 20초인데 실제로는 60초
    expect(await judge(seed, { inputs, ticks: 1200, score }, 60)).toEqual({ accepted: false, reason: 'time' });
  });

  it('지우지 못하는 선택이 섞이거나 끝난 틱 뒤에 입력이 있으면 bad_input', async () => {
    const replayed = [...inputs, { ...inputs[0]!, t: ticks - 1 }];
    expect(await judge(seed, { inputs: replayed, ticks, score })).toEqual({ accepted: false, reason: 'bad_input' });
    expect(await judge(seed, { inputs, ticks: inputs.at(-1)!.t - 1, score })).toEqual({ accepted: false, reason: 'bad_input' });
  });

  it('보낸 점수가 재계산 점수와 다르면 mismatch', async () => {
    expect(await judge(seed, { inputs, ticks, score: score + 1 })).toEqual({ accepted: false, reason: 'mismatch' });
  });

  it('다른 시드의 판에 기록을 붙이면 통과하지 못한다', async () => {
    const result = await judge('other-seed', { inputs, ticks, score });
    expect(result.accepted).toBe(false);
  });
});

describe('isTimePlausible: 일시정지가 있는 게임(성장형)', () => {
  it('실제 시간이 길어도 통과하고, 게임 시간이 실제 시간 + 5초를 넘으면 거절', () => {
    expect(isTimePlausible(600, 10_800, START, after(3600), true)).toBe(true);
    expect(isTimePlausible(600, 10_800, START, after(5), true)).toBe(true);
    expect(isTimePlausible(600, 10_800, START, after(4.9), true)).toBe(false);
    expect(isTimePlausible(10_801, 10_800, START, after(3600), true)).toBe(false);
  });
});

describe('judgePlay: 성장형', () => {
  const state = testShopLogic.initialState();
  const inputs = [
    { t: 60, earn: 3 },
    { t: 120, earn: 4 },
  ];
  /** 시험용 가게 로직으로 하루를 검사한다 */
  function judgeDay(score: number, dayState: TestShopState = state) {
    return judgePlay({
      gameId: GROWTH_TEST_GAME,
      logic: testShopLogic,
      seed: 'day-seed',
      startedAt: START,
      finishedAt: after(600),
      submission: { inputs, ticks: 120, score },
      runner: createInlineRunner(testLogics),
      state: dayState,
    });
  }

  it('통과하면 다음 날 저장 상태를 같이 준다', async () => {
    expect(await judgeDay(7)).toEqual({ accepted: true, score: 7, nextState: { v: 1, day: 2, money: 7, level: 0 } });
  });

  it('그날 아침 상태로 다시 돌린다: 강화 단계가 다르면 점수가 달라 mismatch', async () => {
    expect(await judgeDay(7, { ...state, level: 1 })).toEqual({ accepted: false, reason: 'mismatch' });
  });
});

describe('isTimePlausible', () => {
  it('허용 폭은 5초 + 게임 시간의 10%', () => {
    // 120초 판: 허용 폭 17초
    expect(isTimePlausible(7200, 7200, START, after(137))).toBe(true);
    expect(isTimePlausible(7200, 7200, START, after(137.1))).toBe(false);
    expect(isTimePlausible(7200, 7200, START, after(103))).toBe(true);
    expect(isTimePlausible(7200, 7200, START, after(102.9))).toBe(false);
    // 0초 판(바로 끝내기): 허용 폭 5초
    expect(isTimePlausible(0, 7200, START, after(5))).toBe(true);
    expect(isTimePlausible(0, 7200, START, after(5.1))).toBe(false);
  });
});

describe('judgePlay: 복권 긁기', () => {
  const seed = 'lucky-judge';
  /** 받은 10장을 1초 간격으로 긁은 기록 */
  const inputs: LotteryInput[] = Array.from({ length: 10 }, (_, i) => ({ t: (i + 1) * 60, op: 'scratch' }));
  const score = inputs.reduce((sum, _, i) => sum + drawTicket(seed, i).prize, 0);

  /** 복권 긁기 판 하나를 검사한다 */
  function judgeLucky(submission: FinishPlayRequest) {
    return judgePlay({
      gameId: 'lucky-scratch',
      logic: luckyScratchLogic,
      seed,
      startedAt: START,
      finishedAt: after(submission.ticks / 60 + 1),
      submission,
      runner: inlineReplayRunner,
    });
  }

  it('기록할 수 있는 게임이다', () => {
    expect(isRecordable('lucky-scratch')).toBe(true);
  });

  it('정상 기록은 통과하고 소지금이 점수가 된다', async () => {
    expect(await judgeLucky({ inputs, ticks: 700, score })).toEqual({ accepted: true, score });
  });

  it('돈 없이 산 기록은 bad_input', async () => {
    expect(await judgeLucky({ inputs: [{ t: 0, op: 'buy', count: 1 }], ticks: 60, score: 0 })).toEqual({ accepted: false, reason: 'bad_input' });
  });

  it('긁은 복권만 점수에 들어간다. 더 큰 점수를 보내면 mismatch', async () => {
    const half = inputs.slice(0, 5);
    const halfScore = half.reduce((sum, _, i) => sum + drawTicket(seed, i).prize, 0);
    expect(await judgeLucky({ inputs: half, ticks: 400, score: halfScore })).toEqual({ accepted: true, score: halfScore });
    expect(await judgeLucky({ inputs: half, ticks: 400, score: halfScore + 1000 })).toEqual({ accepted: false, reason: 'mismatch' });
  });
});
