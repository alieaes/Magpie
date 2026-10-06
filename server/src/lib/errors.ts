import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** 모든 오류 응답이 쓰는 형식 */
export interface ErrorBody {
  error: { code: string; message: string };
}

/** 정해진 형식으로 오류 응답을 만든다 */
export function jsonError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json<ErrorBody>({ error: { code, message } }, status);
}
