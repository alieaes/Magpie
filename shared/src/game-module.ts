// 셸(client)과 게임 패키지(games/<id>) 사이의 약속. 셸은 게임을 띄우고(mount) 내리기만(destroy) 한다.
// 판 진행, 그리기, 입력 기록은 게임이 맡고, 시작·결과 화면과 점수 제출은 셸이 맡는다.
// 성장형 게임은 가게·정산 화면까지 게임이 그리고, 서버와는 셸이 넘긴 창구(GrowthSession)로만 이야기한다.
// 브라우저 타입(HTMLElement)을 쓰므로 서버가 가져가는 '@magpie/shared'와 분리해 '@magpie/shared/game-module'로 낸다.

import type { FinishPlayResponse } from './plays';
import type { SaveSnapshot } from './saves';

/** 상단 점수·시간 막대에 보여줄 진행 상황 */
export interface HudState {
  score: number;
  /** 제한 시간이 있는 게임만. 남은 틱 */
  timeLeftTicks?: number;
  /** 제한 시간이 있는 게임만. 전체 틱 */
  timeLimitTicks?: number;
}

/** 한 판의 결과. 기록 모드에서는 그대로 서버에 보내고, 서버는 같은 로직으로 다시 돌려 점수를 확인한다 */
export interface PlayResult<Input = unknown> {
  seed: string;
  inputs: Input[];
  /** 판이 끝난 틱 */
  ticks: number;
  score: number;
}

export interface GameMountOptions {
  seed: string;
  /** 처음부터 소리를 끌지. 소리가 없는 게임은 무시한다 */
  muted?: boolean;
  /** 처음 음량 (0~1). 소리가 없는 게임은 무시한다 */
  volume?: number;
  onHud(state: HudState): void;
  onEnd(result: PlayResult): void;
}

/** 띄운 게임 하나 */
export interface GameInstance {
  /** 지금 판을 끝낸다 ("끝내기" 버튼). onEnd가 불린다 */
  finish(): void;
  /** 소리를 켜거나 끈다. 소리가 없는 게임은 구현하지 않는다 */
  setMuted?(muted: boolean): void;
  /** 음량을 바꾼다 (0~1). 소리가 없는 게임은 구현하지 않는다 */
  setVolume?(volume: number): void;
  /** 화면과 이벤트를 모두 정리한다 */
  destroy(): void;
}

/** 미니게임 패키지의 기본 내보내기 */
export interface GameModule {
  kind?: 'minigame';
  /** parent 안에 게임 화면을 만들고 바로 판을 시작한다 */
  mount(parent: HTMLElement, options: GameMountOptions): Promise<GameInstance>;
}

// --- 성장형 게임 (근거: docs/design/261021-04-game-save.md §6-2) ---

/** 가게 행동의 결과. reason이 'conflict'면 다른 곳에서 저장이 바뀐 것이고 save에 최신 저장이 온다 */
export type GrowthActResult = { ok: true; save: SaveSnapshot } | { ok: false; reason: string; save?: SaveSnapshot };

/** 셸이 성장형 게임에 넘기는 서버 창구. 게임은 서버 주소를 모른다 */
export interface GrowthSession {
  /** saved = 로그인해서 서버에 저장한다, trial = 체험(시작 상태로 하루만, 저장 안 함) */
  mode: 'saved' | 'trial';
  /** 최신 저장을 다시 받는다 */
  load(): Promise<SaveSnapshot>;
  /** 하루를 연다. 서버가 시드를 준다 */
  startDay(): Promise<{ seed: string }>;
  /** 끝난 하루를 보낸다. 통과하면 응답의 save가 새 저장이다(체험이면 save 없음). 보내지 못하면 예외 */
  finishDay(result: PlayResult): Promise<FinishPlayResponse>;
  /** 가게 행동(강화 구매 등)을 보낸다. 보내지 못하면 예외 */
  act(action: unknown): Promise<GrowthActResult>;
  /** 체험 화면의 "로그인" 버튼. 로그인하고 이 페이지로 돌아온다 */
  requestLogin(): void;
  /** 체험일 때 게임 안에 보일 안내("로그인하면 가게가 저장돼요" 등). 셸이 로그인·닉네임 상태로 정한다 */
  trialHint?: string;
}

export interface GrowthMountOptions {
  session: GrowthSession;
  /** 처음 저장. 셸이 먼저 불러와 넘긴다 */
  save: SaveSnapshot;
  /** 처음부터 소리를 끌지 */
  muted?: boolean;
  /** 처음 음량 (0~1) */
  volume?: number;
  /** 하루 장사 중인지 알린다. 장사 중에 "나가기"를 누르면 셸이 한 번 묻는다 */
  onDayActive?(active: boolean): void;
  /** 게임 안 설정에서 소리를 바꿨다. 셸이 브라우저에 저장해 다음에도·미니게임에서도 쓴다 (음량 0~1). 근거: docs/design/261022-14-growth-play-immersive.md */
  onSoundChange?(muted: boolean, volume: number): void;
}

/** 띄운 성장형 게임 하나. 판을 끝내는 버튼이 없다(셸의 "나가기"는 게임을 내린다) */
export interface GrowthInstance {
  setMuted?(muted: boolean): void;
  setVolume?(volume: number): void;
  /** 화면과 이벤트를 모두 정리한다 */
  destroy(): void;
}

/** 성장형 게임 패키지의 기본 내보내기 */
export interface GrowthGameModule {
  kind: 'growth';
  /** 시작 저장 상태. 체험(비로그인)에서 셸이 서버 대신 쓴다 */
  initialState(): unknown;
  /** parent 안에 가게 화면을 만든다. 하루 시작은 게임 안에서 한다 */
  mount(parent: HTMLElement, options: GrowthMountOptions): Promise<GrowthInstance>;
}

/** 셸이 불러오는 게임 패키지 */
export type AnyGameModule = GameModule | GrowthGameModule;
