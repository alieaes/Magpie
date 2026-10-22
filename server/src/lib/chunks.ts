// 기본 키로 여러 줄을 지울 때 쿼리 하나가 너무 커지지 않게 나누는 도구. 탈퇴·관리자 기능이 같이 쓴다.

/** 한 번에 다룰 기본 키 개수 */
export const CHUNK_SIZE = 500;

/** 배열을 size개씩 나눈다 */
export function chunks<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
