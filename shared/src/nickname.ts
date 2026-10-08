// 닉네임 규칙. 화면(즉시 안내)과 서버(최종 검사)가 같이 쓴다. 근거: docs/design/261006-07-login.md §3

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

// 한글(완성형·자모), 영문, 숫자, 밑줄. 공백은 쓸 수 없다
const ALLOWED = /^[0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ]+$/;

// 운영자 사칭을 막는다. 이 말이 들어가면 쓸 수 없다 (대소문자 무시)
const RESERVED_PARTS = ['관리자', '운영자', '운영진', 'admin', 'magpie'];
// 이 이름 그대로는 쓸 수 없다
const RESERVED_EXACT = ['까치', 'gm', 'system', '시스템'];

export type NicknameCheck =
  | { ok: true; value: string }
  | { ok: false; reason: 'length' | 'chars' | 'reserved'; message: string };

/** 닉네임을 검사한다. 앞뒤 공백은 지우고 본다 */
export function checkNickname(raw: string): NicknameCheck {
  const value = raw.trim();
  if (value.length < NICKNAME_MIN || value.length > NICKNAME_MAX) {
    return { ok: false, reason: 'length', message: `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 정해 주세요.` };
  }
  if (!ALLOWED.test(value)) {
    return { ok: false, reason: 'chars', message: '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.' };
  }
  const lower = value.toLowerCase();
  if (RESERVED_EXACT.includes(lower) || RESERVED_PARTS.some((part) => lower.includes(part))) {
    return { ok: false, reason: 'reserved', message: '쓸 수 없는 닉네임이에요.' };
  }
  return { ok: true, value };
}
