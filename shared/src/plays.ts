// 판 시작·끝 API가 주고받는 형식. 근거: docs/design/261006-08-play-submission.md §6
// 성장형 게임은 판(하루)에 저장 버전이 붙는다: docs/design/261021-04-game-save.md §4-3

import type { SaveSnapshot } from './saves';

/**
 * 판이 거절된 사유.
 * bad_input = 입력 기록 형식이 틀렸거나 재계산에 실패, time = 게임 시간과 실제 흐른 시간이 안 맞음,
 * mismatch = 재계산 점수가 보낸 점수와 다름, abandoned = 끝내지 않고 새 판을 시작했거나 하루가 지남,
 * admin = 통과했던 판을 관리자가 지움, stale_save = (성장형) 판을 연 뒤 다른 곳에서 저장이 바뀜
 */
export type PlayRejectReason = 'bad_input' | 'time' | 'mismatch' | 'abandoned' | 'admin' | 'stale_save';

/** POST /api/plays 응답 */
export interface StartPlayResponse {
  playId: number;
  seed: string;
  /** 성장형만. 판을 연 때의 저장 버전 */
  saveVersion?: number;
}

/** POST /api/plays/:id/finish 본문 */
export interface FinishPlayRequest {
  inputs: unknown[];
  /** 판이 끝난 틱 */
  ticks: number;
  /** 클라이언트가 계산한 점수. 서버는 비교에만 쓴다 */
  score: number;
}

/** POST /api/plays/adopt-trial 본문: 로그인 전에 체험한 하루. 시드는 체험 때 클라이언트가 정한 것이다 */
export interface AdoptTrialRequest extends FinishPlayRequest {
  gameId: string;
  seed: string;
}

/** POST /api/plays/adopt-trial 응답. 이어받았으면 새 저장, 아니면 사유(has_record = 이미 기록이 있음) */
export type AdoptTrialResponse =
  | { adopted: true; save: SaveSnapshot }
  | { adopted: false; reason: 'has_record' | 'bad_input' | 'mismatch' | 'time' };

/** POST /api/plays/:id/finish 응답 */
export type FinishPlayResponse =
  | {
      accepted: true;
      /** 서버가 다시 계산한 점수 */
      score: number;
      /** 이 판으로 최고 기록이 바뀌었는지. 성장형은 일간 기록이 없어 today가 늘 false */
      best: { today: boolean; allTime: boolean };
      /**
       * 그 게임의 순위. 미니게임은 오늘 순위(날짜가 바뀌는 순간에 끝나면 null일 수 있다),
       * 성장형은 today가 null이고 allTime에 전체 순위
       */
      rank: { today: number | null; allTime?: number | null };
      /** 성장형만. 그날을 반영한 새 저장 */
      save?: SaveSnapshot;
    }
  | { accepted: false; reason: PlayRejectReason };
