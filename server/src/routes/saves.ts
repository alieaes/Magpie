// 성장형 게임 저장: GET /api/saves/:gameId, POST /api/saves/:gameId/actions.
// 근거: docs/design/261021-04-game-save.md §4-3

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isGameId, type ActionRejectedBody, type GameId, type SaveConflictBody } from '@magpie/shared';
import type { AppEnv } from '../app-env';
import { jsonError, rejectInvalid } from '../lib/errors';
import { RateLimiter } from '../lib/rate-limit';
import { findGrowthLogic, type LogicRegistry } from '../plays/logics';
import type { SaveService } from '../saves/service';

// 유저당 가게 행동은 분당 60회까지
const ACTION_LIMIT = 60;
const ACTION_WINDOW_MS = 60_000;
// 가게 행동 본문 상한. 강화 하나를 고르는 정도라 아주 작다
const ACTION_MAX_BYTES = 8 * 1024;

const GameParam = z.object({
  gameId: z
    .string()
    .refine((id) => isGameId(id), { message: '없는 게임입니다.' })
    .transform((id) => id as GameId),
});
const ActionBody = z.object({
  version: z.int().min(1),
  action: z.unknown(),
});

/** /api/saves 라우트 */
export function saveRoutes(saves: SaveService, logics: LogicRegistry) {
  const actionLimiter = new RateLimiter(ACTION_LIMIT, ACTION_WINDOW_MS);
  /** 저장할 수 있는 게임인지: 기록할 수 있는 성장형 게임 */
  const savable = (gameId: GameId) => logics.isRecordable(gameId) && findGrowthLogic(logics, gameId) !== undefined;

  return new Hono<AppEnv>()
    .get('/saves/:gameId', zValidator('param', GameParam, rejectInvalid), async (c) => {
      const user = c.get('user');
      if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
      if (!user.nickname) return jsonError(c, 403, 'NICKNAME_REQUIRED', '닉네임을 정하면 가게가 저장돼요.');
      const { gameId } = c.req.valid('param');
      if (!savable(gameId)) return jsonError(c, 400, 'BAD_REQUEST', '저장할 수 없는 게임입니다.');
      return c.json(await saves.load(user.id, gameId), 200);
    })
    .post(
      '/saves/:gameId/actions',
      bodyLimit({
        maxSize: ACTION_MAX_BYTES,
        onError: (c) => jsonError(c, 413, 'TOO_LARGE', '요청이 너무 큽니다.'),
      }),
      zValidator('param', GameParam, rejectInvalid),
      zValidator('json', ActionBody, rejectInvalid),
      async (c) => {
        const user = c.get('user');
        if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
        if (!user.nickname) return jsonError(c, 403, 'NICKNAME_REQUIRED', '닉네임을 정하면 가게가 저장돼요.');
        const { gameId } = c.req.valid('param');
        if (!savable(gameId)) return jsonError(c, 400, 'BAD_REQUEST', '저장할 수 없는 게임입니다.');
        if (!actionLimiter.hit(String(user.id))) {
          return jsonError(c, 429, 'TOO_MANY_REQUESTS', '요청이 너무 잦아요. 잠시 뒤 다시 해 주세요.');
        }
        const { version, action } = c.req.valid('json');
        const outcome = await saves.act(user.id, gameId, version, action);
        switch (outcome.kind) {
          case 'ok':
            return c.json(outcome.save, 200);
          case 'conflict':
            return c.json<SaveConflictBody, 409>(
              { error: { code: 'SAVE_CONFLICT', message: '다른 곳에서 가게가 바뀌었어요.' }, save: outcome.save },
              409,
            );
          case 'rejected':
            return c.json<ActionRejectedBody, 400>(
              { error: { code: 'ACTION_REJECTED', message: '지금은 할 수 없어요.' }, reason: outcome.reason },
              400,
            );
          case 'bad_action':
            return jsonError(c, 400, 'BAD_REQUEST', '요청 형식이 맞지 않습니다.');
        }
      },
    );
}
