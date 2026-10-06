// 한국 시간(KST, UTC+9) 기준 날짜 계산. 일간 랭킹의 하루는 KST 00:00 ~ 다음 날 00:00이다.
// 한국은 서머타임이 없어서 고정 9시간으로 계산해도 된다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 시각을 KST 날짜(YYYY-MM-DD)로 바꾼다. 일간 랭킹의 '그날'이다 */
export function kstDayKey(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 그 시각 다음에 오는 첫 KST 자정을 UTC 시각으로 돌려준다. 일간 랭킹이 새로 시작하는 때다 */
export function nextKstMidnight(at: Date): Date {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  shifted.setUTCHours(24, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS);
}

/** KST 날짜(YYYY-MM-DD)의 00:00을 UTC 시각으로 돌려준다 */
export function kstDayStart(dayKey: string): Date {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - KST_OFFSET_MS);
}
