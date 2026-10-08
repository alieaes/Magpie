// 판 기록: 판을 열고(시드 발급), 끝난 판을 검사해 저장하고, 통과하면 최고 기록을 갱신한다.
// 근거: docs/design/261006-08-play-submission.md

import { gzipSync } from 'node:zlib';
import type { Kysely } from 'kysely';
import { findGame, randomSeed, type FinishPlayRequest, type FinishPlayResponse, type GameId, type StartPlayResponse } from '@magpie/shared';
import { inTransaction } from '../db';
import type { Database } from '../db/types';
import type { RankingService } from '../ranking/service';
import { updateBests, type BestChange } from './bests';
import { judgePlay } from './judge';
import { findLogic } from './logics';
import { inlineReplayRunner, type ReplayRunner } from './replay-runner';

const DAY_MS = 86_400_000;

/** 판 끝 요청의 결과. 판을 못 찾았거나 남의 판이거나 이미 끝난 판이면 검사하지 않는다 */
export type FinishOutcome =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'already_finished' }
  | { kind: 'judged'; response: FinishPlayResponse };

export interface PlayService {
  /** 새 판을 연다. 같은 게임의 안 끝난 이전 판은 버린다(abandoned) */
  start(userId: number, gameId: GameId): Promise<StartPlayResponse>;
  /** 끝난 판을 검사하고 저장한다 */
  finish(userId: number, playId: number, submission: FinishPlayRequest): Promise<FinishOutcome>;
}

export interface PlayServiceOptions {
  ranking: RankingService;
  /** 테스트에서 시각을 고정할 때 바꾼다 */
  now?: () => Date;
  runner?: ReplayRunner;
}

/** 판 기록 서비스를 만든다 */
export function createPlayService(
  db: Kysely<Database>,
  { ranking, now = () => new Date(), runner = inlineReplayRunner }: PlayServiceOptions,
): PlayService {
  return {
    async start(userId, gameId) {
      return inTransaction(db, async (trx) => {
        // 안 끝난 판을 먼저 읽고 기본 키로 고친다. 조건으로 바로 UPDATE하면 맞는 줄이 없을 때 틈(gap) 잠금이 걸려
        // 다른 유저가 동시에 판을 열 때 INSERT끼리 교착(deadlock)이 난다
        const pending = await trx
          .selectFrom('plays')
          .select('id')
          .where('user_id', '=', userId)
          .where('game_id', '=', gameId)
          .where('status', '=', 'pending')
          .execute();
        if (pending.length > 0) {
          await trx
            .updateTable('plays')
            .set({ status: 'rejected', reject_reason: 'abandoned' })
            .where('id', 'in', pending.map((p) => p.id))
            .where('status', '=', 'pending')
            .execute();
        }
        const seed = randomSeed();
        const inserted = await trx
          .insertInto('plays')
          .values({ user_id: userId, game_id: gameId, seed, status: 'pending', started_at: now() })
          .executeTakeFirstOrThrow();
        return { playId: Number(inserted.insertId), seed };
      });
    },

    async finish(userId, playId, submission) {
      const play = await db
        .selectFrom('plays')
        .select(['user_id', 'game_id', 'seed', 'status', 'started_at'])
        .where('id', '=', playId)
        .executeTakeFirst();
      if (!play) return { kind: 'not_found' };
      if (Number(play.user_id) !== userId) return { kind: 'forbidden' };
      if (play.status !== 'pending') return { kind: 'already_finished' };

      const game = findGame(play.game_id);
      const logic = findLogic(play.game_id);
      if (!game || !logic) throw new Error(`판의 게임 로직이 없다: ${play.game_id}`);

      const finishedAt = now();
      const judgement = await judgePlay({
        gameId: game.id,
        logic,
        seed: play.seed,
        startedAt: play.started_at,
        finishedAt,
        submission,
        runner,
      });
      // 거절된 판도 입력 기록을 남긴다 (조작 분석용)
      const replayData = gzipSync(JSON.stringify(submission.inputs));

      const best = await inTransaction(db, async (trx): Promise<BestChange | null> => {
        const closed = await trx
          .updateTable('plays')
          .set({
            status: judgement.accepted ? 'accepted' : 'rejected',
            reject_reason: judgement.accepted ? null : judgement.reason,
            score: judgement.accepted ? judgement.score : null,
            client_score: submission.score,
            ended_at: finishedAt,
          })
          .where('id', '=', playId)
          .where('status', '=', 'pending')
          .executeTakeFirst();
        // 같은 판의 끝 요청이 동시에 두 번 왔으면 먼저 처리한 쪽만 남긴다
        if (Number(closed.numUpdatedRows) === 0) return null;
        await trx.insertInto('play_replays').values({ play_id: playId, data: replayData }).execute();
        if (!judgement.accepted) return { today: false, allTime: false };
        return updateBests(trx, { userId, game, score: judgement.score, achievedAt: finishedAt, playId });
      });
      if (best === null) return { kind: 'already_finished' };
      if (!judgement.accepted) return { kind: 'judged', response: { accepted: false, reason: judgement.reason } };

      if (best.today || best.allTime) ranking.invalidate();
      const daily = await ranking.getRanking(game.id, 'daily', 1, userId);
      return {
        kind: 'judged',
        response: { accepted: true, score: judgement.score, best, rank: { today: daily.me?.rank ?? null } },
      };
    },
  };
}

/** 끝나지 않고 하루가 지난 판을 버린 판(abandoned)으로 정리한다. 하루 한 번 돈다. 정리한 개수를 돌려준다 */
export async function abandonStalePlays(db: Kysely<Database>, now = new Date()): Promise<number> {
  const result = await db
    .updateTable('plays')
    .set({ status: 'rejected', reject_reason: 'abandoned' })
    .where('status', '=', 'pending')
    .where('started_at', '<', new Date(now.getTime() - DAY_MS))
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}
