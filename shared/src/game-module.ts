// 셸(client)과 게임 패키지(games/<id>) 사이의 약속. 셸은 게임을 띄우고(mount) 내리기만(destroy) 한다.
// 판 진행, 그리기, 입력 기록은 게임이 맡고, 시작·결과 화면과 점수 제출은 셸이 맡는다.
// 브라우저 타입(HTMLElement)을 쓰므로 서버가 가져가는 '@magpie/shared'와 분리해 '@magpie/shared/game-module'로 낸다.

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
  onHud(state: HudState): void;
  onEnd(result: PlayResult): void;
}

/** 띄운 게임 하나 */
export interface GameInstance {
  /** 지금 판을 끝낸다 ("끝내기" 버튼). onEnd가 불린다 */
  finish(): void;
  /** 화면과 이벤트를 모두 정리한다 */
  destroy(): void;
}

/** 게임 패키지의 기본 내보내기 */
export interface GameModule {
  /** parent 안에 게임 화면을 만들고 바로 판을 시작한다 */
  mount(parent: HTMLElement, options: GameMountOptions): Promise<GameInstance>;
}
