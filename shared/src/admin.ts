// 관리자 대시보드 API 형식. 근거: docs/design/261024-01-admin-dashboard.md §2, docs/design/261024-02-admin-play-history.md §4

import type { PlayRejectReason } from './plays';

/** GET /api/admin/visitors */
export interface AdminVisitorsResponse {
  today: {
    /** KST 날짜 (YYYY-MM-DD) */
    day: string;
    /** 오늘 방문자 수. hourly의 합 */
    total: number;
    /** KST 0~23시에 그날 처음 온 방문자 수 (24칸) */
    hourly: number[];
  };
  /** 날마다 센 방문자의 합 */
  allTime: number;
}

/** 플레이 이력의 구분: member 로그인한 판, guest 비로그인(연습 모드·체험) 판. 근거: docs/design/261024-02-admin-play-history.md §4 */
export type AdminPlayWho = 'member' | 'guest';

/** 로그인한 판 한 줄. 끝난 판만 */
export interface AdminMemberPlay {
  playId: number;
  /** 끝난 시각 (ISO, UTC) */
  at: string;
  /** 지금 닉네임. 없으면 null */
  nickname: string | null;
  /** 배포 전 판은 null */
  ip: string | null;
  /** 통과한 판의 서버 점수. 거절된 판은 null */
  score: number | null;
  /** 거절 사유. 통과한 판은 null */
  rejectReason: PlayRejectReason | null;
}

/** 비로그인 판 한 줄. 점수는 화면이 보낸 값 그대로 */
export interface AdminGuestPlay {
  id: number;
  /** 받은 시각 (ISO, UTC) */
  at: string;
  ip: string | null;
  score: number;
}

/** GET /api/admin/plays. 50개씩 최근 순, 다음 묶음은 nextCursor로 (더 없으면 null) */
export type AdminPlaysResponse =
  | { who: 'member'; items: AdminMemberPlay[]; nextCursor: string | null }
  | { who: 'guest'; items: AdminGuestPlay[]; nextCursor: string | null };
