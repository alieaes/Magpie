// 판 시작·끝 API가 주고받는 형식. 근거: docs/design/261006-08-play-submission.md §6

/**
 * 판이 거절된 사유.
 * bad_input = 입력 기록 형식이 틀렸거나 재계산에 실패, time = 게임 시간과 실제 흐른 시간이 안 맞음,
 * mismatch = 재계산 점수가 보낸 점수와 다름, abandoned = 끝내지 않고 새 판을 시작했거나 하루가 지남
 */
export type PlayRejectReason = 'bad_input' | 'time' | 'mismatch' | 'abandoned';

/** POST /api/plays 응답 */
export interface StartPlayResponse {
  playId: number;
  seed: string;
}

/** POST /api/plays/:id/finish 본문 */
export interface FinishPlayRequest {
  inputs: unknown[];
  /** 판이 끝난 틱 */
  ticks: number;
  /** 클라이언트가 계산한 점수. 서버는 비교에만 쓴다 */
  score: number;
}

/** POST /api/plays/:id/finish 응답 */
export type FinishPlayResponse =
  | {
      accepted: true;
      /** 서버가 다시 계산한 점수 */
      score: number;
      /** 이 판으로 최고 기록이 바뀌었는지 */
      best: { today: boolean; allTime: boolean };
      /** 그 게임의 오늘 순위. 날짜가 바뀌는 순간에 끝나면 null일 수 있다 */
      rank: { today: number | null };
    }
  | { accepted: false; reason: PlayRejectReason };
