// 성장형 게임 저장 API가 주고받는 형식. 근거: docs/design/261021-04-game-save.md §4-3

/** 저장 한 벌. version은 1부터 시작해 저장이 바뀔 때마다 1씩 오른다 */
export interface SaveSnapshot<State = unknown> {
  version: number;
  state: State;
}

/** POST /api/saves/:gameId/actions 본문. version은 클라이언트가 알고 있는 저장 버전 */
export interface SaveActionRequest {
  version: number;
  action: unknown;
}

/** 409 SAVE_CONFLICT 응답. 다른 곳에서 저장이 바뀌었으면 최신 저장을 같이 준다 */
export interface SaveConflictBody {
  error: { code: 'SAVE_CONFLICT'; message: string };
  save: SaveSnapshot;
}

/** 400 ACTION_REJECTED 응답. 게임 규칙에 안 맞는 행동의 사유(no_money 등) */
export interface ActionRejectedBody {
  error: { code: 'ACTION_REJECTED'; message: string };
  reason: string;
}

/** 저장 상태 JSON의 최대 크기(바이트) */
export const SAVE_MAX_BYTES = 16 * 1024;
