// API 호출. Hono RPC 클라이언트라서 서버 라우트 타입이 그대로 따라온다.

import { hc } from 'hono/client';
import type { AppType } from '@magpie/server';
import type {
  FinishPlayRequest,
  AdoptTrialRequest,
  AdoptTrialResponse,
  FinishPlayResponse,
  GameId,
  GameSummary,
  RankingPeriod,
  RankingResponse,
  RankingTarget,
  SaveSnapshot,
  StartPlayResponse,
} from '@magpie/shared';

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
  user: { nickname: string | null; isAdmin: boolean } | null;
  loginAvailable: boolean;
  /** 개발용 테스트 로그인이 켜져 있는지 (개발 서버에서만) */
  devLogin: boolean;
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

/** 기록할 판을 연다. 서버가 시드를 준다. 비로그인·닉네임 전·너무 잦은 시작이면 ApiError(문구 포함) */
export async function startPlay(gameId: GameId): Promise<StartPlayResponse> {
  const res = await client.api.plays.$post({ json: { gameId } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** 끝난 판을 보낸다. 서버가 다시 계산해 통과·거절을 알려준다 */
export async function finishPlay(playId: number, body: FinishPlayRequest): Promise<FinishPlayResponse> {
  const res = await client.api.plays[':id'].finish.$post({ param: { id: String(playId) }, json: body });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** 로그인 전에 체험한 하루를 기록 없는 계정의 첫 하루로 이어받게 한다. 이어받지 못하면 사유가 온다 */
export async function adoptTrialDay(body: AdoptTrialRequest): Promise<AdoptTrialResponse> {
  const res = await client.api.plays['adopt-trial'].$post({ json: body });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** 성장형 게임 저장을 불러온다. 처음이면 서버가 시작 상태로 만들어 준다 */
export async function fetchSave(gameId: GameId): Promise<SaveSnapshot> {
  const res = await client.api.saves[':gameId'].$get({ param: { gameId } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** 가게 행동의 결과. reason이 'conflict'면 다른 곳에서 저장이 바뀐 것이고 save에 최신 저장이 온다 */
export type SaveActionOutcome = { ok: true; save: SaveSnapshot } | { ok: false; reason: string; save?: SaveSnapshot };

/** 가게 행동(강화 구매 등)을 보낸다. 저장 충돌·규칙 위반은 결과로 돌려주고, 그 밖의 실패는 ApiError */
export async function sendSaveAction(gameId: GameId, version: number, action: unknown): Promise<SaveActionOutcome> {
  const res = await client.api.saves[':gameId'].actions.$post({ param: { gameId }, json: { version, action } });
  if (res.ok) return { ok: true, save: await res.json() };
  let body: { error?: { code?: string; message?: string }; reason?: string; save?: SaveSnapshot } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 본문이 JSON이 아니면 아래에서 상태 코드로만 오류를 만든다
  }
  if (body.error?.code === 'SAVE_CONFLICT' && body.save) return { ok: false, reason: 'conflict', save: body.save };
  if (body.error?.code === 'ACTION_REJECTED' && body.reason) return { ok: false, reason: body.reason };
  throw new ApiError(res.status, body.error?.code, body.error?.message);
}

/** 탈퇴한다. confirm은 닉네임(닉네임 전이면 "탈퇴"). 다르면 ApiError(문구 포함) */
export async function deleteAccount(confirm: string): Promise<void> {
  const res = await client.api.me.$delete({ json: { confirm } });
  if (!res.ok) throw await toApiError(res);
}

/** 관리자: 그 판의 기록을 지운다 (최고 기록 줄 삭제, 판은 거절 처리) */
export async function adminRemovePlay(playId: number): Promise<void> {
  const res = await client.api.admin.plays[':playId'].remove.$post({ param: { playId: String(playId) } });
  if (!res.ok) throw await toApiError(res);
}

/** 관리자: 그 유저의 닉네임을 비운다 */
export async function adminResetNickname(userId: number): Promise<void> {
  const res = await client.api.admin.users[':userId']['reset-nickname'].$post({ param: { userId: String(userId) } });
  if (!res.ok) throw await toApiError(res);
}

/** 관리자: "게임" 분류 게임의 전체 랭킹을 비운다. 근거: docs/design/261022-08-game-ranking-reset.md */
export async function adminResetRanking(gameId: string): Promise<void> {
  const res = await client.api.admin.games[':gameId']['reset-ranking'].$post({ param: { gameId } });
  if (!res.ok) throw await toApiError(res);
}

/** 로그아웃한다 */
export async function logout(): Promise<void> {
  const res = await client.auth.logout.$post();
  if (!res.ok) throw new ApiError(res.status);
}

/** 개발용 테스트 계정(테스트N)으로 로그인한다. 개발 서버에서만 켜져 있다. 근거: docs/design/261022-05-dev-login.md */
export async function devLogin(account: number): Promise<void> {
  const res = await client.auth['dev-login'].$post({ json: { account } });
  if (!res.ok) throw await toApiError(res);
}

/** Google 로그인으로 보낸다. 로그인 뒤 지금 보던 주소로 돌아온다 */
export function goToLogin(returnTo: string): void {
  window.location.assign(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
}
