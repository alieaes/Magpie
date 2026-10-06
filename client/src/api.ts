// API 호출. Hono RPC 클라이언트라서 서버 라우트 타입이 그대로 따라온다.

import { hc } from 'hono/client';
import type { AppType } from '@magpie/server';
import type { GameSummary, RankingPeriod, RankingResponse, RankingTarget } from '@magpie/shared';

const client = hc<AppType>('/');

/** API가 실패 응답을 줬을 때 */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API 요청 실패 (${status})`);
  }
}

/** 랭킹을 불러온다 */
export async function fetchRanking(target: RankingTarget, period: RankingPeriod, limit: number): Promise<RankingResponse> {
  const res = await client.api.rankings.$get({ query: { target, period, limit: String(limit) } });
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

/** 로비 카드용 게임별 요약을 불러온다 */
export async function fetchGamesSummary(): Promise<GameSummary[]> {
  const res = await client.api.games.summary.$get();
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}
