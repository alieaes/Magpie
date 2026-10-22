// 판 시작·끝: POST /api/plays, POST /api/plays/:id/finish. 근거: docs/design/261006-08-play-submission.md §6

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isGameId, type GameId } from '@magpie/shared';
import type { AppEnv } from '../app-env';
import { jsonError, rejectInvalid } from '../lib/errors';
import { RateLimiter } from '../lib/rate-limit';
import { defaultLogics, type LogicRegistry } from '../plays/logics';
import type { PlayService } from '../plays/service';

// 유저당 판 시작은 분당 20회까지
const START_LIMIT = 20;
const START_WINDOW_MS = 60_000;
// 끝 요청 본문 상한. 사과게임 입력 기록은 최대 85개라 4KB 안팎이다
const FINISH_MAX_BYTES = 256 * 1024;
const INT32_MAX = 2_147_483_647;

const StartBody = z.object({
  gameId: z
    .string()
    .refine((id) => isGameId(id), { message: '없는 게임입니다.' })
    .transform((id) => id as GameId),
});
const FinishParam = z.object({ id: z.coerce.number().int().positive() });
// inputs의 자세한 형식은 게임 로직이 본다(어긋나면 판을 bad_input으로 거절). 여기서는 겉모양만 본다
const FinishBody = z.object({
  inputs: z.array(z.unknown()),
  ticks: z.int().min(0),
  score: z.int().min(-INT32_MAX).max(INT32_MAX),
});

// 체험 하루 본문. 시드는 클라이언트가 만든 문자열이라 길이만 막는다
const AdoptBody = StartBody.extend({
  seed: z.string().min(1).max(64),
  inputs: z.array(z.unknown()),
  ticks: z.int().min(0),
  score: z.int().min(-INT32_MAX).max(INT32_MAX),
});

/** /api/plays 라우트 */
export function playRoutes(plays: PlayService, logics: LogicRegistry = defaultLogics) {
  const startLimiter = new RateLimiter(START_LIMIT, START_WINDOW_MS);

  return new Hono<AppEnv>()
    .post('/plays', zValidator('json', StartBody, rejectInvalid), async (c) => {
      const user = c.get('user');
      if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
      if (!user.nickname) return jsonError(c, 403, 'NICKNAME_REQUIRED', '닉네임을 정하면 기록이 남아요.');
      const { gameId } = c.req.valid('json');
      if (!logics.isRecordable(gameId)) return jsonError(c, 400, 'BAD_REQUEST', '기록할 수 없는 게임입니다.');
      if (!startLimiter.hit(String(user.id))) {
        return jsonError(c, 429, 'TOO_MANY_REQUESTS', '판을 너무 자주 시작했어요. 잠시 뒤 다시 해 주세요.');
      }
      return c.json(await plays.start(user.id, gameId), 200);
    })
    .post(
      '/plays/adopt-trial',
      bodyLimit({
        maxSize: FINISH_MAX_BYTES,
        onError: (c) => jsonError(c, 413, 'TOO_LARGE', '기록이 너무 큽니다.'),
      }),
      zValidator('json', AdoptBody, rejectInvalid),
      async (c) => {
        const user = c.get('user');
        if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
        if (!user.nickname) return jsonError(c, 403, 'NICKNAME_REQUIRED', '닉네임을 정하면 기록이 남아요.');
        const { gameId, ...trial } = c.req.valid('json');
        if (!logics.isRecordable(gameId)) return jsonError(c, 400, 'BAD_REQUEST', '기록할 수 없는 게임입니다.');
        if (!startLimiter.hit(String(user.id))) {
          return jsonError(c, 429, 'TOO_MANY_REQUESTS', '너무 자주 보냈어요. 잠시 뒤 다시 해 주세요.');
        }
        return c.json(await plays.adoptTrial(user.id, gameId, { gameId, ...trial }), 200);
      },
    )
    .post(
      '/plays/:id/finish',
      bodyLimit({
        maxSize: FINISH_MAX_BYTES,
        onError: (c) => jsonError(c, 413, 'TOO_LARGE', '기록이 너무 큽니다.'),
      }),
      zValidator('param', FinishParam, rejectInvalid),
      zValidator('json', FinishBody, rejectInvalid),
      async (c) => {
        const user = c.get('user');
        if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
        const outcome = await plays.finish(user.id, c.req.valid('param').id, c.req.valid('json'));
        switch (outcome.kind) {
          case 'not_found':
            return jsonError(c, 404, 'NOT_FOUND', '없는 판입니다.');
          case 'forbidden':
            return jsonError(c, 403, 'FORBIDDEN', '내 판이 아닙니다.');
          case 'already_finished':
            return jsonError(c, 409, 'PLAY_FINISHED', '이미 끝난 판입니다.');
          case 'judged':
            return c.json(outcome.response, 200);
        }
      },
    );
}
