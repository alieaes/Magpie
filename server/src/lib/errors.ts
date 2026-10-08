import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** 모든 오류 응답이 쓰는 형식 */
export interface ErrorBody {
  error: { code: string; message: string };
}

/** 정해진 형식으로 오류 응답을 만든다. 상태 코드 타입이 그대로 남아 RPC 클라이언트가 성공·실패를 구분한다 */
export function jsonError<S extends ContentfulStatusCode>(c: Context, status: S, code: string, message: string) {
  return c.json<ErrorBody, S>({ error: { code, message } }, status);
}

/** zValidator 검사에 실패한 요청을 400 BAD_REQUEST로 돌려보낸다. 검사 훅으로 넘겨 쓴다 */
export function rejectInvalid(result: { success: boolean }, c: Context) {
  if (!result.success) return jsonError(c, 400, 'BAD_REQUEST', '요청 형식이 맞지 않습니다.');
}
