import { GAMES, isGameId, type RankingPeriod, type RankingTarget } from '@magpie/shared';

export interface TargetOption {
  value: RankingTarget;
  label: string;
}

/** 랭킹 대상 선택지: 총합 + 플레이할 수 있는 게임들 */
export function rankingTargetOptions(): TargetOption[] {
  return [
    { value: 'total', label: '총합' },
    ...GAMES.filter((g) => g.status === 'playable').map((g) => ({ value: g.id, label: g.name })),
  ];
}

/** 주소 쿼리의 대상 값을 확인한다. 모르는 값이면 총합 */
export function parseTarget(value: unknown): RankingTarget {
  return typeof value === 'string' && isGameId(value) ? value : 'total';
}

/** 주소 쿼리의 기간 값을 확인한다. 모르는 값이면 일간 */
export function parsePeriod(value: unknown): RankingPeriod {
  return value === 'alltime' ? 'alltime' : 'daily';
}
