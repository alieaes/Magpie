// 서버가 판을 다시 돌릴 수 있는 게임 로직. 게임을 추가하면 여기에 한 줄 넣는다
// (클라이언트 쪽은 client/src/games/registry.ts). 서버는 게임 패키지의 logic만 가져온다(Phaser 없음).

import { findGame, isGrowthLogic, type AnyGameLogic, type GameId, type GrowthLogic } from '@magpie/shared';
import { appleTenLogic } from '@magpie/game-apple-ten/logic';
import { fishBunLogic } from '@magpie/game-fish-bun/logic';
import { luckyScratchLogic } from '@magpie/game-lucky-scratch/logic';
import { snackBarLogic } from '@magpie/game-snack-bar/logic';

const LOGICS: Partial<Record<GameId, AnyGameLogic>> = {
  'apple-ten': appleTenLogic,
  'lucky-scratch': luckyScratchLogic,
  'fish-bun': fishBunLogic,
  'snack-bar': snackBarLogic,
};

/** 게임 id로 로직을 찾고, 기록할 수 있는 게임인지 본다. 테스트는 시험용 로직을 끼운 등록부를 만들어 쓴다 */
export interface LogicRegistry {
  /** 게임 id로 로직을 찾는다. 없으면 undefined */
  find(gameId: string): AnyGameLogic | undefined;
  /** 기록을 남길 수 있는 게임인지: 플레이할 수 있고 로직이 있어야 한다 */
  isRecordable(gameId: GameId): boolean;
}

/** 로직 목록으로 등록부를 만든다. isPlayable은 게임이 열려 있는지 본다(기본: 게임 목록의 status) */
export function createLogicRegistry(
  logics: Partial<Record<GameId, AnyGameLogic>>,
  isPlayable: (gameId: GameId) => boolean = (gameId) => findGame(gameId)?.status === 'playable',
): LogicRegistry {
  return {
    find: (gameId) => logics[gameId as GameId],
    isRecordable: (gameId) => isPlayable(gameId) && logics[gameId] !== undefined,
  };
}

/** 실제 게임 로직 등록부 */
export const defaultLogics = createLogicRegistry(LOGICS);

/** 게임 id로 로직을 찾는다. 없으면 undefined */
export function findLogic(gameId: string): AnyGameLogic | undefined {
  return defaultLogics.find(gameId);
}

/** 기록을 남길 수 있는 게임인지: 플레이할 수 있고(playable) 서버에 로직이 있어야 한다 */
export function isRecordable(gameId: GameId): boolean {
  return defaultLogics.isRecordable(gameId);
}

/** 성장형 로직을 찾는다. 없거나 미니게임이면 undefined */
export function findGrowthLogic(logics: LogicRegistry, gameId: string): GrowthLogic | undefined {
  const logic = logics.find(gameId);
  return logic && isGrowthLogic(logic) ? logic : undefined;
}
