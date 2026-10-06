// 랭킹 API가 주고받는 형식. 규칙: docs/design/261006-06-ranking.md

import type { GameId } from './games';

/** 랭킹 기간. daily = KST 하루, alltime = 전체 기간 */
export type RankingPeriod = 'daily' | 'alltime';

/** 랭킹 대상. total = 총합(게임별 순위를 환산해 더한 점수) */
export type RankingTarget = 'total' | GameId;

export const RANKING_PERIODS: readonly RankingPeriod[] = ['daily', 'alltime'];

/** 한 번에 받을 수 있는 최대 줄 수 */
export const RANKING_MAX_LIMIT = 100;

/** 총합 환산에서 게임별 1위가 받는 점수 */
export const TOTAL_POINTS_PER_GAME = 1000;

/** 랭킹 한 줄 */
export interface RankingEntry {
  rank: number;
  nickname: string;
  /** 게임별이면 원래 점수, 총합이면 환산점 합 */
  score: number;
}

/** GET /api/rankings 응답 */
export interface RankingResponse {
  target: RankingTarget;
  period: RankingPeriod;
  /** 일간일 때만. KST 날짜 YYYY-MM-DD */
  day?: string;
  /** 일간일 때만. 다음 KST 00:00 (ISO, UTC) */
  resetsAt?: string;
  participants: number;
  entries: RankingEntry[];
  /** 로그인했고 기록이 있을 때만 */
  me?: { rank: number; score: number };
}

/** GET /api/games/summary 응답의 한 줄 */
export interface GameSummary {
  gameId: GameId;
  todayTop: { nickname: string; score: number } | null;
  myTodayBest: number | null;
  myAllTimeBest: number | null;
}

/**
 * 게임별 순위를 총합용 환산점으로 바꾼다. 1위 = 1000점, 꼴찌 = 1000 / N점.
 * 서버는 같은 공식을 SQL로 계산한다(ranking/queries.ts). 이 함수는 화면 설명과 테스트에 쓴다.
 */
export function rankToPoints(rank: number, participants: number): number {
  return Math.round((TOTAL_POINTS_PER_GAME * (participants - rank + 1)) / participants);
}
