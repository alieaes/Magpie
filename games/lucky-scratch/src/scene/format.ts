// 화면에 쓰는 금액 표기

/** 금액 "125,000원" */
export function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 금액을 "1,000만원"처럼 줄인다 (만 원 단위로 나누어떨어질 때만) */
export function shortWon(n: number): string {
  if (n >= 10_000 && n % 10_000 === 0) return `${(n / 10_000).toLocaleString('ko-KR')}만원`;
  return won(n);
}

/** 색 숫자를 CSS·Phaser 글자 색 문자열로 */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
