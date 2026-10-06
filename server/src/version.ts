// 빌드할 때 esbuild가 커밋 해시로 바꿔 넣는다 (scripts/build.mjs). 개발 중에는 정의되지 않는다.
declare const __MAGPIE_VERSION__: string | undefined;

/** 서버 빌드 버전. 개발 중에는 'dev' */
export const VERSION: string = typeof __MAGPIE_VERSION__ === 'string' ? __MAGPIE_VERSION__ : 'dev';
