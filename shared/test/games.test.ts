import { describe, expect, it } from 'vitest';
import { GAMES, findGame, isGameId } from '../src/games';

describe('게임 목록', () => {
  it('id가 겹치지 않는다', () => {
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id는 URL·DB에 그대로 쓸 수 있는 형식이다', () => {
    for (const g of GAMES) expect(g.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('id로 찾고 확인한다', () => {
    expect(isGameId('apple-ten')).toBe(true);
    expect(isGameId('nope')).toBe(false);
    expect(findGame('apple-ten')?.name).toBe('사과게임');
    expect(findGame('nope')).toBeUndefined();
  });
});
