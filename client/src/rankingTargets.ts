import {
  GAMES,
  GAME_KINDS,
  GAME_KIND_LABELS,
  gameKind,
  hasDailyRanking,
  isGameId,
  type GameKind,
  type RankingPeriod,
  type RankingTarget,
} from '@magpie/shared';

export interface TargetOption {
  value: RankingTarget;
  label: string;
}

/** 분류 하나의 랭킹 대상 묶음 */
export interface TargetGroup {
  kind: GameKind;
  label: string;
  options: TargetOption[];
}

/**
 * 랭킹 대상 선택지를 분류별로 묶는다: 미니게임(총합 + 플레이할 수 있는 미니게임), 게임(플레이할 수 있는 성장형).
 * 비는 묶음은 뺀다. 근거: docs/design/261022-07-game-categories.md §4
 */
export function rankingTargetGroups(): TargetGroup[] {
  const playable = GAMES.filter((g) => g.status === 'playable');
  return GAME_KINDS.map((kind) => ({
    kind,
    label: GAME_KIND_LABELS[kind],
    options: [
      ...(kind === 'minigame' ? [{ value: 'total' as const, label: '총합' }] : []),
      ...playable.filter((g) => gameKind(g) === kind).map((g) => ({ value: g.id, label: g.name })),
    ],
  })).filter((group) => group.options.length > 0);
}

/** 주소 쿼리의 대상 값을 확인한다. 모르는 값이면 총합 */
export function parseTarget(value: unknown): RankingTarget {
  return typeof value === 'string' && isGameId(value) ? value : 'total';
}

/** 주소 쿼리의 기간 값을 확인한다. 모르는 값이면 일간 */
export function parsePeriod(value: unknown): RankingPeriod {
  return value === 'alltime' ? 'alltime' : 'daily';
}

/** 실제로 보여줄 기간. 일간 랭킹이 없는 대상(성장형)은 고른 기간과 상관없이 전체(역대) */
export function effectivePeriod(target: RankingTarget, period: RankingPeriod): RankingPeriod {
  return hasDailyRanking(target) ? period : 'alltime';
}
