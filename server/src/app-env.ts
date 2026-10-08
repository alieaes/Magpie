/** 로그인한 유저. 세션 미들웨어가 요청마다 채운다 */
export interface SessionUser {
  id: number;
  nickname: string | null;
}

/** Hono 컨텍스트에 붙는 값 */
export type AppEnv = {
  Variables: {
    user: SessionUser | null;
  };
};
