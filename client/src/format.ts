import { findGame, type RankingPeriod, type RankingTarget } from '@magpie/shared';

const numberFormat = new Intl.NumberFormat('ko-KR');

/** 숫자에 천 단위 쉼표를 넣는다 */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** 랭킹 대상의 점수 단위. 총합은 환산점이라 '점' */
export function scoreUnit(target: RankingTarget): string {
  return target === 'total' ? '점' : (findGame(target)?.scoreUnit ?? '점');
}

/** 랭킹 대상의 화면 이름 */
export function targetLabel(target: RankingTarget): string {
  return target === 'total' ? '총합' : (findGame(target)?.name ?? target);
}

/** 기간의 화면 이름 */
export function periodLabel(period: RankingPeriod): string {
  return period === 'daily' ? '일간' : '역대';
}

/** 남은 밀리초를 "3시간 12분" 꼴로 바꾼다. 1분 미만이면 "1분 미만" */
export function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return '1분 미만';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
