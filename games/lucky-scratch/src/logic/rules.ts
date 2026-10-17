// 복권 긁기 규칙. 서버도 이 코드로 판을 다시 돌려 점수(소지금)를 확인한다.
// 결정성 규칙(CLAUDE.md §4-3): 시드 난수와 정수 연산만 쓴다. Math.random, 실제 시각, 초월함수를 쓰지 않는다.
// 근거: docs/design/261016-02-lucky-scratch.md

import { SeededRandom, TICKS_PER_SECOND, type ReplayResult } from '@magpie/shared';

/** 복권 한 장 값 */
export const TICKET_PRICE = 1000;
/** 판을 시작할 때 받는 복권 */
export const FREE_TICKETS = 10;
/** 한 판에 가질 수 있는 복권(받은 것 포함) */
export const MAX_TICKETS = 200;
/** 한 번에 살 수 있는 최대 장수 */
export const MAX_BUY = 10;
/** 화면의 구매 단위 */
export const BUY_OPTIONS = [1, 5, 10] as const;
/** 제한 시간 5분 */
export const TIME_LIMIT_TICKS = 5 * 60 * TICKS_PER_SECOND;
/** 긁기 사이 최소 간격(0.25초). 사람 손으로는 이보다 빨리 한 장을 다 긁을 수 없다 */
export const MIN_SCRATCH_TICKS = 15;
/** 기록 최대 개수: 긁기 200 + 사기 190 */
export const MAX_INPUTS = MAX_TICKETS + (MAX_TICKETS - FREE_TICKETS);
/** 복권 한 장의 칸 수 (3 × 3) */
export const GRID_SIZE = 3;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** 등수. 1~5등, 0 = 꽝 */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5;

/** 그림 번호. 등수 - 1 (0 까치, 1 왕관, 2 보석, 3 클로버, 4 복주머니) */
export type SymbolId = 0 | 1 | 2 | 3 | 4;
export const SYMBOL_COUNT = 5;

export interface PrizeTier {
  rank: Exclude<Rank, 0>;
  prize: number;
  /** 100만 분의 몇 */
  weight: number;
}

/** 당첨표. 확률은 weight / WEIGHT_TOTAL. 한 장 기대 당첨금 850원 */
export const PRIZE_TABLE: readonly PrizeTier[] = [
  { rank: 1, prize: 10_000_000, weight: 10 },
  { rank: 2, prize: 1_000_000, weight: 100 },
  { rank: 3, prize: 50_000, weight: 2_000 },
  { rank: 4, prize: 5_000, weight: 50_000 },
  { rank: 5, prize: 1_000, weight: 300_000 },
];
export const WEIGHT_TOTAL = 1_000_000;

/** 이론상 최고 점수: 200장이 모두 1등. DB 점수 열(INT) 안에 들어간다 */
export const MAX_SCORE = MAX_TICKETS * PRIZE_TABLE[0]!.prize;

/** 복권 한 장 */
export interface Ticket {
  /** 판에서 몇 번째 복권인지 (0부터) */
  index: number;
  rank: Rank;
  prize: number;
  /** 9칸의 그림. 인덱스 = 행 × 3 + 열 */
  symbols: SymbolId[];
  /** 당첨 그림이 놓인 칸 3개. 꽝이면 빈 배열 */
  winCells: number[];
}

/** 등수의 당첨금. 꽝은 0 */
export function prizeOf(rank: Rank): number {
  return PRIZE_TABLE.find((t) => t.rank === rank)?.prize ?? 0;
}

/** 당첨표 구간에서 등수를 뽑는다 */
function drawRank(rng: SeededRandom): Rank {
  let r = rng.int(0, WEIGHT_TOTAL - 1);
  for (const tier of PRIZE_TABLE) {
    if (r < tier.weight) return tier.rank;
    r -= tier.weight;
  }
  return 0;
}

/** 시드 난수로 배열을 섞는다 (Fisher–Yates) */
function shuffle<T>(rng: SeededRandom, items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/**
 * index번째 복권을 만든다. 장마다 시드 난수를 따로 만들어 어느 장이든 바로 만들 수 있다.
 * 당첨이면 당첨 그림 3개 + 나머지 그림은 각각 2개 이하, 꽝이면 모든 그림이 2개 이하다.
 */
export function drawTicket(seed: string, index: number): Ticket {
  const rng = new SeededRandom(`${seed}#${index}`);
  const rank = drawRank(rng);
  const win = rank === 0 ? null : ((rank - 1) as SymbolId);

  // 당첨 그림을 뺀 그림을 2개씩 넣고 섞어서 남은 칸을 채운다. 그래서 다른 그림은 3개가 될 수 없다
  const pool: SymbolId[] = [];
  for (let s = 0; s < SYMBOL_COUNT; s += 1) {
    if (s !== win) pool.push(s as SymbolId, s as SymbolId);
  }
  shuffle(rng, pool);
  const symbols = win === null ? pool.slice(0, CELL_COUNT) : [win, win, win, ...pool.slice(0, CELL_COUNT - 3)];
  shuffle(rng, symbols);

  const winCells = win === null ? [] : symbols.flatMap((s, i) => (s === win ? [i] : []));
  return { index, rank, prize: prizeOf(rank), symbols, winCells };
}

/** 한 판의 진행 상태 */
export interface LotteryState {
  /** 소지금 */
  money: number;
  /** 가지고 있지만 아직 긁지 않은 복권 */
  tickets: number;
  /** 긁은 복권 수 = 다음에 긁을 복권 번호 */
  scratched: number;
  /** 지금까지 가진 복권 수(받은 것 + 산 것) */
  owned: number;
}

/** 판을 시작할 때의 상태: 복권 10장, 소지금 0원 */
export function createState(): LotteryState {
  return { money: 0, tickets: FREE_TICKETS, scratched: 0, owned: FREE_TICKETS };
}

/** 구매를 막는 사유. null이면 살 수 있다 */
export type BuyBlock = 'bad_count' | 'no_money' | 'ticket_limit' | null;

/** count장을 살 수 있는지 본다 */
export function buyBlock(state: LotteryState, count: number): BuyBlock {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BUY) return 'bad_count';
  if (state.owned + count > MAX_TICKETS) return 'ticket_limit';
  if (state.money < count * TICKET_PRICE) return 'no_money';
  return null;
}

/** count장을 산다. 살 수 없으면 상태를 그대로 두고 false */
export function buyTickets(state: LotteryState, count: number): boolean {
  if (buyBlock(state, count) !== null) return false;
  state.money -= count * TICKET_PRICE;
  state.tickets += count;
  state.owned += count;
  return true;
}

/** 다음 복권을 다 긁는다. 당첨금이 소지금에 들어간다. 남은 복권이 없으면 null */
export function scratchNext(state: LotteryState, seed: string): Ticket | null {
  if (state.tickets === 0) return null;
  const ticket = drawTicket(seed, state.scratched);
  state.money += ticket.prize;
  state.tickets -= 1;
  state.scratched += 1;
  return ticket;
}

/** 파산: 남은 복권이 없고 한 장도 살 수 없다 */
export function isBroke(state: LotteryState): boolean {
  return state.tickets === 0 && state.money < TICKET_PRICE;
}

/** 더 할 수 있는 게 없다: 파산했거나 200장을 다 긁었다 */
export function isOver(state: LotteryState): boolean {
  return isBroke(state) || (state.tickets === 0 && state.owned >= MAX_TICKETS);
}

/** 입력 기록 한 줄: 복권 한 장을 다 긁음, 또는 count장을 삼 */
export type LotteryInput = { t: number; op: 'scratch' } | { t: number; op: 'buy'; count: number };

/**
 * 입력 기록을 처음부터 다시 적용해 점수(마지막 소지금)를 낸다. 서버의 점수 확인이 이 함수를 쓴다.
 * 긁지 않은 복권은 점수에 들어가지 않는다(설계 §1-2).
 */
export function replay(seed: string, inputs: readonly LotteryInput[]): ReplayResult {
  if (inputs.length > MAX_INPUTS) return { ok: false, reason: 'too_many_inputs', index: MAX_INPUTS };
  const state = createState();
  let lastTick = 0;
  let lastScratch = -MIN_SCRATCH_TICKS;
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    if (!Number.isInteger(input.t) || input.t < lastTick || input.t > TIME_LIMIT_TICKS) {
      return { ok: false, reason: 'bad_tick', index: i };
    }
    if (input.op === 'scratch') {
      if (state.tickets === 0) return { ok: false, reason: 'no_ticket', index: i };
      if (input.t - lastScratch < MIN_SCRATCH_TICKS) return { ok: false, reason: 'too_fast', index: i };
      scratchNext(state, seed);
      lastScratch = input.t;
    } else if (input.op === 'buy') {
      const block = buyBlock(state, input.count);
      if (block !== null) return { ok: false, reason: block, index: i };
      buyTickets(state, input.count);
    } else {
      return { ok: false, reason: 'bad_op', index: i };
    }
    lastTick = input.t;
  }
  return { ok: true, score: state.money, ticks: lastTick };
}
