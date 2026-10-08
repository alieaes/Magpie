import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 상태를 바꾸는 요청(POST·PUT·DELETE 등)은 우리 사이트에서 온 것만 받는다 (요청 위조 방지).
 * 브라우저는 이런 요청에 Origin 헤더를 붙인다. 없거나 다르면 403.
 */
export function sameOriginOnly(siteUrl: string): MiddlewareHandler {
  const allowed = new URL(siteUrl).origin;
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.header('origin') !== allowed) {
      return jsonError(c, 403, 'BAD_ORIGIN', '허용되지 않은 요청입니다.');
    }
    await next();
  };
}
