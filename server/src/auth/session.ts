import type { Context } from 'hono';

/**
 * 요청한 유저의 id를 돌려준다. 비로그인이면 null.
 * 로그인(Google OIDC + 세션)을 만들기 전까지는 항상 null이다. 로그인 설계에서 세션 쿠키 확인으로 바꾼다.
 */
export async function getSessionUserId(_c: Context): Promise<number | null> {
  return null;
}
