/** 쿠키 이름과 공통 옵션 */
export interface CookieSettings {
  secure: boolean;
  /** 로그인 세션 */
  session: string;
  /** 로그인 도중 잠깐 쓰는 값(state, nonce, PKCE) */
  oauth: string;
  base: { httpOnly: true; secure: boolean; sameSite: 'Lax'; path: '/' };
}

/**
 * 사이트 주소에 맞는 쿠키 설정을 만든다.
 * https면 Secure를 켜고 이름에 __Host- 를 붙인다. 같은 aviaryhub.org 아래 다른 서비스가
 * 상위 도메인 쿠키로 우리 쿠키를 덮어쓰지 못하게 하기 위해서다.
 */
export function cookieSettings(siteUrl: string): CookieSettings {
  const secure = siteUrl.startsWith('https://');
  const prefix = secure ? '__Host-' : '';
  return {
    secure,
    session: `${prefix}magpie_session`,
    oauth: `${prefix}magpie_oauth`,
    base: { httpOnly: true, secure, sameSite: 'Lax', path: '/' },
  };
}
