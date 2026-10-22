/** 게임 화면 방향 */
export type Orientation = 'landscape' | 'portrait';

/** 랭킹 정렬 방향. desc = 높을수록 좋음, asc = 낮을수록 좋음(기록 게임) */
export type ScoreSort = 'desc' | 'asc';

/** 로비 카드 상태. coming-soon이면 카드가 흐리게 보이고 누를 수 없다 */
export type GameStatus = 'playable' | 'coming-soon';

/**
 * 게임 종류(분류). minigame = 한 판으로 끝나는 게임, growth = 하루 단위로 저장하며 키우는 성장형.
 * 화면에서는 성장형을 "게임"이라고 부른다(GAME_KIND_LABELS).
 * 근거: docs/design/261021-04-game-save.md, docs/design/261022-07-game-categories.md
 */
export type GameKind = 'minigame' | 'growth';

/** 분류의 화면 이름 */
export const GAME_KIND_LABELS: Readonly<Record<GameKind, string>> = { minigame: '미니게임', growth: '게임' };

/** 분류 순서. 로비 묶음과 랭킹 대상 묶음이 이 순서를 따른다 */
export const GAME_KINDS: readonly GameKind[] = ['minigame', 'growth'];

/** 로비·랭킹·점수 제출이 같이 보는 게임 정보 */
export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  orientation: Orientation;
  scoreUnit: string;
  sort: ScoreSort;
  status: GameStatus;
  /** 시작 화면에 보여줄 규칙 설명 한두 문장 */
  howTo?: string;
  /** 플레이 중 상단에 보여줄 점수 이름. 없으면 "점수" */
  scoreLabel?: string;
  /** 없으면 미니게임 */
  kind?: GameKind;
  /** 랭킹에서 이 게임 탭을 고르면 보여줄 설명 한 줄 */
  rankingNote?: string;
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
    status: 'playable',
    howTo: '드래그해서 사각형 안 숫자의 합을 10으로 만들면 사과가 사라져요. 120초 동안 최대한 많이 지워 보세요.',
  },
  {
    id: 'lucky-scratch',
    name: '복권 긁기',
    tagline: '긁어서 1등을 노려라',
    orientation: 'portrait',
    scoreUnit: '원',
    sort: 'desc',
    status: 'playable',
    howTo:
      '복권 10장으로 시작해요. 같은 그림 3개가 나오면 당첨! 당첨금으로 복권을 더 사거나, 원할 때 정산하면 소지금이 기록돼요. 제한 시간은 5분이고, 정산할 때 긁지 않은 복권은 무효예요.',
    scoreLabel: '소지금',
  },
  {
    id: 'fish-bun',
    name: '붕어빵 가게',
    tagline: '붕어빵을 구워 팔고 가게를 키워라',
    orientation: 'portrait',
    scoreUnit: '원',
    sort: 'desc',
    status: 'playable',
    kind: 'growth',
    scoreLabel: '하루 수익',
    rankingNote: '하루 장사로 가장 많이 번 날의 수익이에요.',
  },
  {
    id: 'snack-bar',
    name: '분식집',
    tagline: '물 주고, 만들고, 나르고, 닦아라',
    orientation: 'portrait',
    scoreUnit: '원',
    sort: 'desc',
    status: 'playable',
    kind: 'growth',
    scoreLabel: '하루 수익',
    rankingNote: '하루 장사로 가장 많이 번 날의 수익이에요.',
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

/** 게임의 분류. kind가 없으면 미니게임 */
export function gameKind(game: GameMeta): GameKind {
  return game.kind ?? 'minigame';
}

/** 성장형("게임" 분류)인지. 하루 단위로 저장하고, 일간 랭킹이 없고, 총합 랭킹에서 빠진다 */
export function isGrowthGame(game: GameMeta): boolean {
  return game.kind === 'growth';
}
