// 가게 격자: 8 × 7 칸. 통로·테이블·의자·조리대 자리와 바라보는 대상, 화면·흉내 플레이어가 쓰는 길찾기.
// 하루 규칙(rules.ts)은 길을 모른다. 걷기는 한 칸씩 입력으로만 들어온다. 근거: docs/design/261022-09-snack-bar.md §4, §7

/** 격자 크기 (가로 화면 기준) */
export const GRID_W = 8;
export const GRID_H = 7;

/** 방향: 0 위, 1 오른쪽, 2 아래, 3 왼쪽 */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface Cell {
  x: number;
  y: number;
}

/** 테이블 자리 (T1~T6 = 0~5). 손님 의자는 위아래 칸 쪽으로 붙여 그리고, 그 칸은 길이다 */
export const TABLE_CELLS: readonly Cell[] = [
  { x: 1, y: 1 },
  { x: 3, y: 1 },
  { x: 5, y: 1 },
  { x: 1, y: 5 },
  { x: 3, y: 5 },
  { x: 5, y: 5 },
];
/** 조리대 줄: x = 7, y = 조리대 번호 (0~4 메뉴, 5 물·단무지, 6 쓰레기통) */
export const STATION_X = 7;
export const WATER_STATION = 5;
export const TRASH_STATION = 6;
export const STATION_COUNT = 7;
/** 손님이 들어오는 문 */
export const DOOR: Cell = { x: 0, y: 6 };
/** 하루를 시작하는 칸과 방향 */
export const START: Cell = { x: 4, y: 3 };
export const START_FACING: Dir = 2;

/** 바라보는 대상 */
export type Target = { kind: 'table'; index: number } | { kind: 'station'; index: number };

/** 격자 안인지 */
export function inGrid(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

/** 캐릭터가 걸어 다닐 수 있는 칸인지: 테이블 칸(잠긴 테이블 포함), 조리대 줄, 문만 못 지나감. 테이블 위아래 칸은 길 */
export function isWalkable(x: number, y: number): boolean {
  if (!inGrid(x, y) || x === STATION_X) return false;
  if (x === DOOR.x && y === DOOR.y) return false;
  return !TABLE_CELLS.some((c) => c.x === x && c.y === y);
}

/** 칸에 있는 대상. 테이블·조리대가 아니면 null */
export function targetAt(x: number, y: number): Target | null {
  if (!inGrid(x, y)) return null;
  if (x === STATION_X) return { kind: 'station', index: y };
  const table = TABLE_CELLS.findIndex((c) => c.x === x && c.y === y);
  return table >= 0 ? { kind: 'table', index: table } : null;
}

/** 이 칸에서 dir 쪽을 바라볼 때 앞 칸의 대상. 테이블은 왼쪽·오른쪽에서 바라볼 때만(위아래 길에서는 지나가기만) */
export function facedTarget(pos: Cell, dir: Dir): Target | null {
  const [dx, dy] = DIRS[dir]!;
  const target = targetAt(pos.x + dx, pos.y + dy);
  if (target?.kind === 'table' && dy !== 0) return null;
  return target;
}

/** 대상을 바라볼 수 있는 칸과 그때 방향: 테이블은 왼쪽·오른쪽 통로, 조리대 줄은 x = 6 */
export function standSpots(target: Target): { x: number; y: number; dir: Dir }[] {
  if (target.kind === 'station') return [{ x: STATION_X - 1, y: target.index, dir: 1 }];
  const c = TABLE_CELLS[target.index]!;
  return [
    { x: c.x - 1, y: c.y, dir: 1 as Dir },
    { x: c.x + 1, y: c.y, dir: 3 as Dir },
  ].filter((s) => isWalkable(s.x, s.y));
}

/** 두 칸 사이 걷는 길(방향 목록). 너비 우선 탐색, 같은 길이면 위·오른쪽·아래·왼쪽 순서. 못 가면 null */
export function findPath(from: Cell, to: Cell): Dir[] | null {
  if (!isWalkable(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const key = (x: number, y: number) => y * GRID_W + x;
  const prev = new Map<number, { k: number; d: Dir }>();
  const queue: Cell[] = [from];
  const seen = new Set([key(from.x, from.y)]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const [dx, dy] = DIRS[d]!;
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !isWalkable(nx, ny)) continue;
      seen.add(k);
      prev.set(k, { k: key(cur.x, cur.y), d });
      if (nx === to.x && ny === to.y) {
        const path: Dir[] = [];
        let at = k;
        const start = key(from.x, from.y);
        while (at !== start) {
          const p = prev.get(at)!;
          path.push(p.d);
          at = p.k;
        }
        return path.reverse();
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** 대상까지 가장 가까운 바라보는 칸으로 가는 길과 마지막에 바라볼 방향. 이미 그 칸이면 길은 빈 목록 */
export function routeTo(from: Cell, target: Target): { path: Dir[]; dir: Dir } | null {
  let best: { path: Dir[]; dir: Dir } | null = null;
  for (const spot of standSpots(target)) {
    const path = findPath(from, spot);
    if (path && (!best || path.length < best.path.length)) best = { path, dir: spot.dir };
  }
  return best;
}
