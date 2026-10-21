// 성장형 게임 저장: 불러오기, 가게 행동 적용, 로비 카드용 진행 상황.
// 근거: docs/design/261021-04-game-save.md §4

import type { Kysely } from 'kysely';
import type { GameId, SaveSnapshot } from '@magpie/shared';
import { inTransaction } from '../db';
import type { Database } from '../db/types';
import { defaultLogics, findGrowthLogic, type LogicRegistry } from '../plays/logics';
import { decodeState, ensureSave, readSave, writeSave } from './store';

/** 가게 행동 요청의 결과 */
export type ActOutcome =
  | { kind: 'ok'; save: SaveSnapshot }
  /** 보낸 버전이 지금 저장과 다르다. 최신 저장을 같이 준다 */
  | { kind: 'conflict'; save: SaveSnapshot }
  /** 행동의 형식이 게임 로직과 맞지 않는다 */
  | { kind: 'bad_action' }
  /** 게임 규칙에 안 맞는다 (돈 부족 등) */
  | { kind: 'rejected'; reason: string };

export interface SaveService {
  /** 저장을 읽는다. 없으면 시작 상태로 만들어(버전 1) 준다 */
  load(userId: number, gameId: GameId): Promise<SaveSnapshot>;
  /** 가게 행동을 적용한다. version은 클라이언트가 알고 있는 저장 버전 */
  act(userId: number, gameId: GameId, version: number, action: unknown): Promise<ActOutcome>;
  /** 로비 카드용: 저장이 있는 성장형 게임마다 몇 일째인지 */
  progress(userId: number): Promise<Map<string, number>>;
}

export interface SaveServiceOptions {
  logics?: LogicRegistry;
  /** 테스트에서 시각을 고정할 때 바꾼다 */
  now?: () => Date;
}

/** 저장 서비스를 만든다 */
export function createSaveService(db: Kysely<Database>, { logics = defaultLogics, now = () => new Date() }: SaveServiceOptions = {}): SaveService {
  /** 성장형 로직을 찾는다. 라우트가 먼저 확인하므로 없으면 서버 잘못이다 */
  function growthLogic(gameId: string) {
    const logic = findGrowthLogic(logics, gameId);
    if (!logic) throw new Error(`성장형 로직이 없다: ${gameId}`);
    return logic;
  }

  return {
    async load(userId, gameId) {
      const logic = growthLogic(gameId);
      await ensureSave(db, userId, gameId, logic, now());
      const save = await readSave(db, userId, gameId, logic);
      if (!save) throw new Error(`저장을 만들지 못했다: ${userId}/${gameId}`);
      return save;
    },

    async act(userId, gameId, version, action) {
      const logic = growthLogic(gameId);
      const parsed = logic.actionSchema.safeParse(action);
      if (!parsed.success) return { kind: 'bad_action' };

      return inTransaction(db, async (trx): Promise<ActOutcome> => {
        const at = now();
        await ensureSave(trx, userId, gameId, logic, at);
        const current = await readSave(trx, userId, gameId, logic, true);
        if (!current) throw new Error(`저장이 없다: ${userId}/${gameId}`);
        if (current.version !== version) return { kind: 'conflict', save: current };

        const result = logic.applyAction(current.state, parsed.data);
        if (!result.ok) return { kind: 'rejected', reason: result.reason };

        // 줄을 잠근 채라 버전 조건은 항상 맞는다
        await writeSave(trx, userId, gameId, current.version, result.state, at);
        await trx
          .insertInto('save_actions')
          .values({ user_id: userId, game_id: gameId, version: current.version, action: JSON.stringify(parsed.data), created_at: at })
          .execute();
        return { kind: 'ok', save: { version: current.version + 1, state: result.state } };
      });
    },

    async progress(userId) {
      const rows = await db.selectFrom('game_saves').select(['game_id', 'data']).where('user_id', '=', userId).execute();
      const days = new Map<string, number>();
      for (const row of rows) {
        const logic = findGrowthLogic(logics, row.game_id);
        if (!logic) continue;
        try {
          days.set(row.game_id, logic.dayOf(decodeState(logic, row.data)));
        } catch (err) {
          // 카드 한 줄 때문에 로비 전체가 실패하지 않게 한다
          console.warn('[saves] 진행 상황을 읽지 못했다', userId, row.game_id, err);
        }
      }
      return days;
    },
  };
}
