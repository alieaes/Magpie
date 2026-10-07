// 게임 id → 게임 패키지. 고른 게임 코드만 그때 내려받는다(동적 import).
// 게임을 추가하면 여기에 한 줄 넣고, 게임 목록(shared/src/games.ts)의 status를 playable로 바꾼다.

import type { GameId } from '@magpie/shared';
import type { GameModule } from '@magpie/shared/game-module';

const LOADERS: Partial<Record<GameId, () => Promise<{ default: GameModule }>>> = {
  'apple-ten': () => import('@magpie/game-apple-ten'),
};

/** 이 게임의 코드가 등록돼 있는지 */
export function hasGameModule(id: GameId): boolean {
  return id in LOADERS;
}

/** 게임 패키지를 불러온다 */
export async function loadGameModule(id: GameId): Promise<GameModule> {
  const loader = LOADERS[id];
  if (!loader) throw new Error(`게임 코드가 없다: ${id}`);
  return (await loader()).default;
}
