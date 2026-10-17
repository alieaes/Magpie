// 서버가 판을 다시 돌릴 수 있는 게임 로직. 게임을 추가하면 여기에 한 줄 넣는다
// (클라이언트 쪽은 client/src/games/registry.ts). 서버는 게임 패키지의 logic만 가져온다(Phaser 없음).

import { findGame, type GameId, type GameLogic } from '@magpie/shared';
import { appleTenLogic } from '@magpie/game-apple-ten/logic';
import { luckyScratchLogic } from '@magpie/game-lucky-scratch/logic';

const LOGICS: Partial<Record<GameId, GameLogic>> = {
  'apple-ten': appleTenLogic,
  'lucky-scratch': luckyScratchLogic,
};

/** 게임 id로 로직을 찾는다. 없으면 undefined */
export function findLogic(gameId: string): GameLogic | undefined {
  return LOGICS[gameId as GameId];
}

/** 기록을 남길 수 있는 게임인지: 플레이할 수 있고(playable) 서버에 로직이 있어야 한다 */
export function isRecordable(gameId: GameId): boolean {
  return findGame(gameId)?.status === 'playable' && findLogic(gameId) !== undefined;
}
