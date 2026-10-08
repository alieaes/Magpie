// API 호출. Hono RPC 클라이언트라서 서버 라우트 타입이 그대로 따라온다.

import { hc } from 'hono/client';
import type { AppType } from '@magpie/server';
import type { GameSummary, RankingPeriod, RankingResponse, RankingTarget } from '@magpie/shared';

const client = hc<AppType>('/');

/** API가 실패 응답을 줬을 때. 서버가 준 오류 코드·문구가 있으면 같이 담는다 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    message?: string,
  ) {
    super(message ?? `API 요청 실패 (${status})`);
  }
}

/** 실패 응답 본문에서 오류 코드·문구를 꺼내 ApiError를 만든다 */
async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(res.status, body.error?.code, body.error?.message);
  } catch {
    return new ApiError(res.status);
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

/** 내 로그인 상태 */
export interface MeResponse {
  user: { nickname: string | null } | null;
  loginAvailable: boolean;
}

/** 내 로그인 상태를 불러온다 */
export async function fetchMe(): Promise<MeResponse> {
  const res = await client.api.me.$get();
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

/** 닉네임을 정하거나 바꾼다. 규칙 위반·중복이면 ApiError(문구 포함) */
export async function updateNickname(nickname: string): Promise<string> {
  const res = await client.api.me.nickname.$put({ json: { nickname } });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).nickname;
}

/** 로그아웃한다 */
export async function logout(): Promise<void> {
  const res = await client.auth.logout.$post();
  if (!res.ok) throw new ApiError(res.status);
}

/** Google 로그인으로 보낸다. 로그인 뒤 지금 보던 주소로 돌아온다 */
export function goToLogin(returnTo: string): void {
  window.location.assign(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
}
