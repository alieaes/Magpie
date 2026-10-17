import { describe, expect, it } from 'vitest';
import {
  CELL_COUNT,
  FREE_TICKETS,
  MAX_INPUTS,
  MAX_SCORE,
  MAX_TICKETS,
  MIN_SCRATCH_TICKS,
  PRIZE_TABLE,
  SYMBOL_COUNT,
  TICKET_PRICE,
  TIME_LIMIT_TICKS,
  WEIGHT_TOTAL,
  buyBlock,
  buyTickets,
  createState,
  drawTicket,
  isBroke,
  luckyScratchLogic,
  replay,
  scratchNext,
  type LotteryInput,
} from '../src/logic';

/** 그림별 개수 */
function counts(symbols: number[]): number[] {
  const out = new Array<number>(SYMBOL_COUNT).fill(0);
  for (const s of symbols) out[s]! += 1;
  return out;
}

/** 소지금이 되는 만큼 사고 긁기를 반복하며 입력 기록을 만든다 (긁기는 20틱 간격) */
function playAll(seed: string, stopAt = Infinity): { inputs: LotteryInput[]; money: number } {
  const state = createState();
  const inputs: LotteryInput[] = [];
  let t = 0;
  for (;;) {
    while (state.tickets > 0) {
      t += 20;
      scratchNext(state, seed);
      inputs.push({ t, op: 'scratch' });
    }
    if (state.money >= stopAt) break;
    const count = Math.min(10, Math.floor(state.money / TICKET_PRICE), MAX_TICKETS - state.owned);
    if (count < 1) break;
    buyTickets(state, count);
    inputs.push({ t, op: 'buy', count });
  }
  return { inputs, money: state.money };
}

describe('당첨표', () => {
  it('한 장 기대 당첨금은 850원, 최고 점수는 DB INT 안', () => {
    const ev = PRIZE_TABLE.reduce((sum, t) => sum + t.prize * t.weight, 0) / WEIGHT_TOTAL;
    expect(ev).toBe(850);
    expect(MAX_SCORE).toBe(2_000_000_000);
    expect(MAX_SCORE).toBeLessThanOrEqual(2 ** 31 - 1);
  });
});

describe('drawTicket', () => {
  it('같은 시드·같은 장 번호면 같은 복권, 장 번호가 다르면 다른 복권', () => {
    expect(drawTicket('seed-1', 3)).toEqual(drawTicket('seed-1', 3));
    const a = Array.from({ length: 20 }, (_, i) => drawTicket('seed-1', i).symbols.join(''));
    const b = Array.from({ length: 20 }, (_, i) => drawTicket('seed-2', i).symbols.join(''));
    expect(a).not.toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(10);
  });

  it('당첨은 당첨 그림만 정확히 3개, 꽝은 3개짜리 그림이 없다', () => {
    let wins = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const ticket = drawTicket('grid', i);
      expect(ticket.symbols).toHaveLength(CELL_COUNT);
      const c = counts(ticket.symbols);
      if (ticket.rank === 0) {
        expect(Math.max(...c)).toBeLessThanOrEqual(2);
        expect(ticket.winCells).toEqual([]);
        expect(ticket.prize).toBe(0);
      } else {
        wins += 1;
        const win = ticket.rank - 1;
        expect(c[win]).toBe(3);
        expect(c.filter((n, s) => s !== win).every((n) => n <= 2)).toBe(true);
        expect(ticket.winCells).toHaveLength(3);
        for (const cell of ticket.winCells) expect(ticket.symbols[cell]).toBe(win);
        expect(ticket.prize).toBe(PRIZE_TABLE[win]!.prize);
      }
    }
    expect(wins).toBeGreaterThan(0);
  });

  it('등수 분포가 당첨표와 대략 맞는다', () => {
    const n = 200_000;
    const byRank = new Array<number>(6).fill(0);
    for (let i = 0; i < n; i += 1) byRank[drawTicket(`dist-${i % 997}`, i).rank]! += 1;
    // 5등 30%, 4등 5%, 3등 0.2% — 표본 오차의 4배 안
    expect(Math.abs(byRank[5]! / n - 0.3)).toBeLessThan(0.005);
    expect(Math.abs(byRank[4]! / n - 0.05)).toBeLessThan(0.002);
    expect(Math.abs(byRank[3]! - 400)).toBeLessThan(90);
    expect(byRank[2]!).toBeLessThan(60);
    expect(Math.abs(byRank[0]! / n - 0.64789)).toBeLessThan(0.005);
  });
});

describe('상태', () => {
  it('처음에는 복권 10장, 소지금 0원이라 살 수 없다', () => {
    const state = createState();
    expect(state).toEqual({ money: 0, tickets: FREE_TICKETS, scratched: 0, owned: FREE_TICKETS });
    expect(buyBlock(state, 1)).toBe('no_money');
    expect(buyTickets(state, 1)).toBe(false);
  });

  it('살 수 있는 장수와 200장 상한', () => {
    const state = { money: 1_000_000, tickets: 0, scratched: 195, owned: 195 };
    expect(buyBlock(state, 0)).toBe('bad_count');
    expect(buyBlock(state, 11)).toBe('bad_count');
    expect(buyBlock(state, 1.5)).toBe('bad_count');
    expect(buyBlock(state, 10)).toBe('ticket_limit');
    expect(buyBlock(state, 5)).toBeNull();
    expect(buyTickets(state, 5)).toBe(true);
    expect(state).toEqual({ money: 995_000, tickets: 5, scratched: 195, owned: 200 });
  });

  it('남은 복권이 없고 1,000원이 안 되면 파산', () => {
    expect(isBroke({ money: 999, tickets: 0, scratched: 10, owned: 10 })).toBe(true);
    expect(isBroke({ money: 1000, tickets: 0, scratched: 10, owned: 10 })).toBe(false);
    expect(isBroke({ money: 0, tickets: 1, scratched: 9, owned: 10 })).toBe(false);
  });
});

describe('replay', () => {
  it('기록 재생 점수 = 플레이하며 쌓은 소지금', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { inputs, money } = playAll(seed, 30_000);
      const result = replay(seed, inputs);
      expect(result).toEqual({ ok: true, score: money, ticks: inputs.at(-1)?.t ?? 0 });
      expect(luckyScratchLogic.inputSchema.safeParse(inputs).success).toBe(true);
    }
  });

  it('긁지 않은 복권은 점수에 들어가지 않는다', () => {
    const inputs: LotteryInput[] = Array.from({ length: 4 }, (_, i) => ({ t: (i + 1) * 20, op: 'scratch' }));
    const expected = [0, 1, 2, 3].reduce((sum, i) => sum + drawTicket('partial', i).prize, 0);
    expect(replay('partial', inputs)).toEqual({ ok: true, score: expected, ticks: 80 });
  });

  it('입력이 없으면 0원', () => {
    expect(replay('empty', [])).toEqual({ ok: true, score: 0, ticks: 0 });
  });

  it('돈 없이 사면 실패', () => {
    expect(replay('x', [{ t: 0, op: 'buy', count: 1 }])).toEqual({ ok: false, reason: 'no_money', index: 0 });
  });

  it('남은 복권 없이 긁으면 실패', () => {
    const inputs: LotteryInput[] = Array.from({ length: 11 }, (_, i) => ({ t: (i + 1) * 20, op: 'scratch' }));
    expect(replay('x', inputs)).toEqual({ ok: false, reason: 'no_ticket', index: 10 });
  });

  it('긁기 간격이 0.25초보다 짧으면 실패', () => {
    const inputs: LotteryInput[] = [
      { t: 30, op: 'scratch' },
      { t: 30 + MIN_SCRATCH_TICKS - 1, op: 'scratch' },
    ];
    expect(replay('x', inputs)).toEqual({ ok: false, reason: 'too_fast', index: 1 });
    // 첫 장은 판을 열자마자 긁어도 된다
    expect(replay('x', [{ t: 0, op: 'scratch' }]).ok).toBe(true);
  });

  it('틱이 줄어들거나 5분을 넘으면 실패', () => {
    expect(replay('x', [{ t: 100, op: 'scratch' }, { t: 99, op: 'scratch' }])).toEqual({ ok: false, reason: 'bad_tick', index: 1 });
    expect(replay('x', [{ t: TIME_LIMIT_TICKS + 1, op: 'scratch' }])).toEqual({ ok: false, reason: 'bad_tick', index: 0 });
    expect(replay('x', [{ t: 1.5, op: 'scratch' }])).toEqual({ ok: false, reason: 'bad_tick', index: 0 });
  });

  it('입력이 너무 많으면 실패', () => {
    const inputs: LotteryInput[] = Array.from({ length: MAX_INPUTS + 1 }, (_, i) => ({ t: i * 20, op: 'scratch' }));
    expect(replay('x', inputs)).toEqual({ ok: false, reason: 'too_many_inputs', index: MAX_INPUTS });
  });
});

describe('inputSchema', () => {
  it('모르는 동작, 범위 밖 장수, 개수 초과를 막는다', () => {
    const schema = luckyScratchLogic.inputSchema;
    expect(schema.safeParse([{ t: 0, op: 'scratch' }, { t: 1, op: 'buy', count: 10 }]).success).toBe(true);
    expect(schema.safeParse([{ t: 0, op: 'steal' }]).success).toBe(false);
    expect(schema.safeParse([{ t: 0, op: 'buy', count: 11 }]).success).toBe(false);
    expect(schema.safeParse([{ t: 0, op: 'buy' }]).success).toBe(false);
    expect(schema.safeParse([{ t: -1, op: 'scratch' }]).success).toBe(false);
    expect(schema.safeParse(Array.from({ length: MAX_INPUTS + 1 }, () => ({ t: 0, op: 'scratch' }))).success).toBe(false);
  });
});
