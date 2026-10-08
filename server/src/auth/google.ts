// Google 로그인(OIDC). 범위는 openid 하나만 요청한다: 이메일·이름·사진을 받지 않는다.

import { discovery, type Configuration } from 'openid-client';

export const GOOGLE_ISSUER = new URL('https://accounts.google.com');

/** OIDC 설정을 돌려주는 함수. 테스트에서는 미리 만든 설정으로 바꿔 끼운다 */
export type OidcConfigLoader = () => Promise<Configuration>;

/**
 * Google의 OIDC 설정을 처음 쓸 때 한 번 받아 기억한다.
 * 서버 시작이 Google 응답에 묶이지 않게 미리 받지 않는다. 받다가 실패하면 다음 로그인 때 다시 받는다.
 */
export function googleConfigLoader(clientId: string, clientSecret: string): OidcConfigLoader {
  let pending: Promise<Configuration> | null = null;
  return () => {
    pending ??= discovery(GOOGLE_ISSUER, clientId, clientSecret).catch((err: unknown) => {
      pending = null;
      throw err;
    });
    return pending;
  };
}

/** 로그인 뒤 돌아갈 주소. 우리 사이트 안의 경로만 받는다 (다른 사이트로 보내는 데 악용되지 않게) */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/auth/')) return '/';
  return value;
}
