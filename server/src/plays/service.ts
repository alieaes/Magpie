// 판 기록: 판을 열고(시드 발급), 끝난 판을 검사해 저장하고, 통과하면 최고 기록을 갱신한다.
// 성장형 게임은 판(하루)에 저장 버전을 붙이고, 통과하면 같은 트랜잭션에서 저장을 다음 날 상태로 바꾼다.
// 근거: docs/design/261006-08-play-submission.md, docs/design/261021-04-game-save.md §4-3

import { gzipSync } from 'node:zlib';
import type { Kysely } from 'kysely';
import {
  TICKS_PER_SECOND,
  findGame,
  hasDailyRanking,
  isGrowthLogic,
  randomSeed,
  type FinishPlayRequest,
  type AdoptTrialRequest,
  type AdoptTrialResponse,
  type FinishPlayResponse,
  type GameId,
  type PlayRejectReason,
  type SaveSnapshot,
  type StartPlayResponse,
} from '@magpie/shared';
import { inTransaction } from '../db';
import type { Database } from '../db/types';
import type { RankingService } from '../ranking/service';
import { ensureSave, readSave, readSaveVersion, writeSave } from '../saves/store';
import { updateBests, type BestChange } from './bests';
import { judgePlay, type Judgement } from './judge';
import { defaultLogics, type LogicRegistry } from './logics';
import { createInlineRunner, type ReplayRunner } from './replay-runner';

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
  /** 로그인 전에 체험한 하루를 기록이 없는 계정의 첫 하루로 이어받는다. 랭킹에는 넣지 않는다 */
  adoptTrial(userId: number, gameId: GameId, trial: AdoptTrialRequest): Promise<AdoptTrialResponse>;
}

export interface PlayServiceOptions {
  ranking: RankingService;
  /** 테스트에서 시각을 고정할 때 바꾼다 */
  now?: () => Date;
  /** 게임 로직 등록부. 테스트는 시험용 로직을 끼운다 */
  logics?: LogicRegistry;
  runner?: ReplayRunner;
}

/** 판의 최종 판정. 성장형은 판을 연 뒤 저장이 바뀌었으면 stale_save로 거절한다 */
type FinalJudgement = Judgement | { accepted: false; reason: Extract<PlayRejectReason, 'stale_save'> };

/** 판 기록 서비스를 만든다 */
export function createPlayService(
  db: Kysely<Database>,
  { ranking, now = () => new Date(), logics = defaultLogics, runner = createInlineRunner(logics) }: PlayServiceOptions,
): PlayService {
  /** 판이 통과한 뒤의 내 순위. 일간 랭킹이 있으면 오늘 순위, 성장형은 전체 순위 */
  async function rankAfterPlay(gameId: GameId, userId: number): Promise<{ today: number | null; allTime?: number | null }> {
    if (hasDailyRanking(gameId)) return { today: (await ranking.getRanking(gameId, 'daily', 1, userId)).me?.rank ?? null };
    return { today: null, allTime: (await ranking.getRanking(gameId, 'alltime', 1, userId)).me?.rank ?? null };
  }

  return {
    async start(userId, gameId) {
      const logic = logics.find(gameId);
      const growth = logic !== undefined && isGrowthLogic(logic) ? logic : undefined;
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
        const at = now();
        // 성장형은 판을 연 때의 저장 버전을 판에 적는다. 저장이 없으면 시작 상태로 만든다
        let saveVersion: number | undefined;
        if (growth) {
          await ensureSave(trx, userId, gameId, growth, at);
          saveVersion = await readSaveVersion(trx, userId, gameId);
        }
        const seed = randomSeed();
        const inserted = await trx
          .insertInto('plays')
          .values({ user_id: userId, game_id: gameId, seed, save_version: saveVersion ?? null, status: 'pending', started_at: at })
          .executeTakeFirstOrThrow();
        const response: StartPlayResponse = { playId: Number(inserted.insertId), seed };
        if (saveVersion !== undefined) response.saveVersion = saveVersion;
        return response;
      });
    },

    async finish(userId, playId, submission) {
      const play = await db
        .selectFrom('plays')
        .select(['user_id', 'game_id', 'seed', 'save_version', 'status', 'started_at'])
        .where('id', '=', playId)
        .executeTakeFirst();
      if (!play) return { kind: 'not_found' };
      if (Number(play.user_id) !== userId) return { kind: 'forbidden' };
      if (play.status !== 'pending') return { kind: 'already_finished' };

      const game = findGame(play.game_id);
      const logic = logics.find(play.game_id);
      if (!game || !logic) throw new Error(`판의 게임 로직이 없다: ${play.game_id}`);
      const growth = isGrowthLogic(logic) ? logic : undefined;
      const baseVersion = play.save_version === null ? null : Number(play.save_version);

      const finishedAt = now();
      let judgement: FinalJudgement;
      if (growth) {
        // 그날 아침 저장이 그대로일 때만 하루를 다시 돌린다. 판을 연 뒤 저장이 바뀌었으면 검사할 것도 없다
        const save = await readSave(db, userId, game.id, growth);
        judgement =
          save === undefined || baseVersion === null || save.version !== baseVersion
            ? { accepted: false, reason: 'stale_save' }
            : await judgePlay({ gameId: game.id, logic, seed: play.seed, startedAt: play.started_at, finishedAt, submission, runner, state: save.state });
      } else {
        judgement = await judgePlay({ gameId: game.id, logic, seed: play.seed, startedAt: play.started_at, finishedAt, submission, runner });
      }
      // 거절된 판도 입력 기록을 남긴다 (조작 분석용)
      const replayData = gzipSync(JSON.stringify(submission.inputs));

      const closedPlay = await inTransaction(
        db,
        async (trx): Promise<{ final: FinalJudgement; best: BestChange; save?: SaveSnapshot } | null> => {
          let final = judgement;
          // 재계산하는 사이에 저장이 바뀌었을 수 있다. 저장 줄을 잠그고 버전을 다시 본다
          if (growth && final.accepted && (await readSaveVersion(trx, userId, game.id, true)) !== baseVersion) {
            final = { accepted: false, reason: 'stale_save' };
          }
          const closed = await trx
            .updateTable('plays')
            .set({
              status: final.accepted ? 'accepted' : 'rejected',
              reject_reason: final.accepted ? null : final.reason,
              score: final.accepted ? final.score : null,
              client_score: submission.score,
              ended_at: finishedAt,
            })
            .where('id', '=', playId)
            .where('status', '=', 'pending')
            .executeTakeFirst();
          // 같은 판의 끝 요청이 동시에 두 번 왔으면 먼저 처리한 쪽만 남긴다
          if (Number(closed.numUpdatedRows) === 0) return null;
          await trx.insertInto('play_replays').values({ play_id: playId, data: replayData }).execute();
          if (!final.accepted) return { final, best: { today: false, allTime: false } };

          let save: SaveSnapshot | undefined;
          if (growth && baseVersion !== null) {
            // 줄을 잠근 채 버전을 확인했으므로 항상 바뀐다
            await writeSave(trx, userId, game.id, baseVersion, final.nextState, finishedAt);
            save = { version: baseVersion + 1, state: final.nextState };
          }
          const best = await updateBests(trx, { userId, game, score: final.score, achievedAt: finishedAt, playId });
          return save ? { final, best, save } : { final, best };
        },
      );
      if (closedPlay === null) return { kind: 'already_finished' };
      const { final, best, save } = closedPlay;
      if (!final.accepted) return { kind: 'judged', response: { accepted: false, reason: final.reason } };

      if (best.today || best.allTime) ranking.invalidate();
      const response: FinishPlayResponse = { accepted: true, score: final.score, best, rank: await rankAfterPlay(game.id, userId) };
      if (save) response.save = save;
      return { kind: 'judged', response };
    },

    async adoptTrial(userId, gameId, trial) {
      const logic = logics.find(gameId);
      if (!logic || !isGrowthLogic(logic)) return { adopted: false, reason: 'bad_input' };
      const at = now();
      await ensureSave(db, userId, gameId, logic, at);
      const save = await readSave(db, userId, gameId, logic);
      if (!save || save.version !== 1) return { adopted: false, reason: 'has_record' };

      // 서버가 연 판이 아니라 시작 시각이 없으므로 게임 시간만큼 앞선 시각으로 두어 시간 검사를 통과시킨다
      const startedAt = new Date(at.getTime() - (trial.ticks / TICKS_PER_SECOND) * 1000);
      const judgement = await judgePlay({ gameId, logic, seed: trial.seed, startedAt, finishedAt: at, submission: trial, runner, state: save.state });
      if (!judgement.accepted) return { adopted: false, reason: judgement.reason };

      const replayData = gzipSync(JSON.stringify(trial.inputs));
      return inTransaction(db, async (trx): Promise<AdoptTrialResponse> => {
        // 줄을 잠그고 버전을 다시 본다. 그사이 기록이 생겼으면 이어받지 않는다
        if ((await readSaveVersion(trx, userId, gameId, true)) !== 1) return { adopted: false, reason: 'has_record' };
        const inserted = await trx
          .insertInto('plays')
          .values({
            user_id: userId,
            game_id: gameId,
            seed: trial.seed,
            save_version: 1,
            status: 'accepted',
            score: judgement.score,
            client_score: trial.score,
            started_at: startedAt,
            ended_at: at,
          })
          .executeTakeFirstOrThrow();
        await trx.insertInto('play_replays').values({ play_id: Number(inserted.insertId), data: replayData }).execute();
        await writeSave(trx, userId, gameId, 1, judgement.nextState, at);
        return { adopted: true, save: { version: 2, state: judgement.nextState } };
      });
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
