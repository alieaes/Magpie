/** 게임 화면 방향 */
export type Orientation = 'landscape' | 'portrait';

/** 랭킹 정렬 방향. desc = 높을수록 좋음, asc = 낮을수록 좋음(기록 게임) */
export type ScoreSort = 'desc' | 'asc';

/** 로비 카드 상태. coming-soon이면 카드가 흐리게 보이고 누를 수 없다 */
export type GameStatus = 'playable' | 'coming-soon';

/** 로비·랭킹·점수 제출이 같이 보는 게임 정보 */
export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  orientation: Orientation;
  scoreUnit: string;
  sort: ScoreSort;
  status: GameStatus;
}

/**
 * 전체 게임 목록. 게임을 추가할 때 고치는 곳은 여기 하나다.
 * 순서는 로비 카드 순서다. 근거: docs/design/261006-01-game-catalog.md
 */
const GAME_DEFS = [
  {
    id: 'apple-ten',
    name: '사과게임',
    tagline: '합이 10이 되게 사과를 묶어라',
    orientation: 'landscape',
    scoreUnit: '개',
    sort: 'desc',
    status: 'coming-soon',
  },
  {
    id: 'fruit-merge',
    name: '과일 합치기',
    tagline: '같은 과일을 합쳐 수박을 만들어라',
    orientation: 'portrait',
    scoreUnit: '점',
    sort: 'desc',
    status: 'coming-soon',
  },
  {
    id: 'blade-orbit',
    name: '칼날 모으기',
    tagline: '칼날을 모아 보스를 쓰러뜨려라',
    orientation: 'portrait',
    scoreUnit: '스테이지',
    sort: 'desc',
    status: 'coming-soon',
  },
  {
    id: 'number-dungeon',
    name: '숫자 던전',
    tagline: '나보다 작은 숫자만 잡아먹어라',
    orientation: 'portrait',
    scoreUnit: '스테이지',
    sort: 'desc',
    status: 'coming-soon',
  },
  {
    id: 'frost-camp',
    name: '설원 캠프',
    tagline: '곰을 사냥해 생존자를 지켜라',
    orientation: 'portrait',
    scoreUnit: '점',
    sort: 'desc',
    status: 'coming-soon',
  },
] as const satisfies readonly GameMeta[];

/** 게임 id 문자열 타입 */
export type GameId = (typeof GAME_DEFS)[number]['id'];

/** 등록된 게임. id만 GameId로 좁히고 나머지(상태 등)는 넓은 타입으로 둔다 */
export interface Game extends GameMeta {
  id: GameId;
}

export const GAMES: readonly Game[] = GAME_DEFS;

const GAME_BY_ID = new Map<string, Game>(GAMES.map((g) => [g.id, g]));

/** 문자열이 등록된 게임 id인지 확인한다 */
export function isGameId(id: string): id is GameId {
  return GAME_BY_ID.has(id);
}

/** id로 게임 정보를 찾는다. 없으면 undefined */
export function findGame(id: string): Game | undefined {
  return GAME_BY_ID.get(id);
}
