// 게임 id → 게임 패키지. 고른 게임 코드만 그때 내려받는다(동적 import).
// 게임을 추가하면 여기에 한 줄 넣고, 게임 목록(shared/src/games.ts)의 status를 playable로 바꾼다.
// 미니게임(GameModule)과 성장형(GrowthGameModule)을 같이 둔다. 어느 쪽인지는 모듈의 kind로 안다.

import type { GameId } from '@magpie/shared';
import type { AnyGameModule } from '@magpie/shared/game-module';

const LOADERS: Partial<Record<GameId, () => Promise<{ default: AnyGameModule }>>> = {
  'apple-ten': () => import('@magpie/game-apple-ten'),
  'lucky-scratch': () => import('@magpie/game-lucky-scratch'),
  'fish-bun': () => import('@magpie/game-fish-bun'),
  'snack-bar': () => import('@magpie/game-snack-bar'),
};

/** 이 게임의 코드가 등록돼 있는지 */
export function hasGameModule(id: GameId): boolean {
  return id in LOADERS;
}

/** 게임 패키지를 불러온다 */
export async function loadGameModule(id: GameId): Promise<AnyGameModule> {
  const loader = LOADERS[id];
  if (!loader) throw new Error(`게임 코드가 없다: ${id}`);
  return (await loader()).default;
}
