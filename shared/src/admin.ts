// 관리자 대시보드 API 형식. 근거: docs/design/261024-01-admin-dashboard.md §2

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
