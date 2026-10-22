// 손님 대사. 짧고 요즘 말투, 존댓말 기본(꼬마만 반말). 애교체·사투리·성별 호칭·유행어는 쓰지 않는다.
// 대사 고르기는 연출이라 로직(서버 재계산)과 무관하다. 근거: docs/design/261021-02-fish-bun-customers.md §3

import type { CustomerKind, Quality, SaleResult } from '../logic/rules';

/** 대사 상황 */
export type LineKey = 'order' | 'wait' | 'good' | 'best' | 'extra' | 'noExtra' | 'raw' | 'burnt' | 'leave' | 'overtaken' | 'wrongMenu';

/** 주문 개수 말 ("두 개") */
const COUNT_WORDS = ['', '한 개', '두 개', '세 개', '네 개', '다섯 개', '여섯 개'];

/** {n}은 주문 개수 말로, {m}은 메뉴 이름("슈크림 ")으로 바뀐다. 메뉴가 팥 하나뿐인 날은 {m}이 빈 말이다 */
const LINES: Record<CustomerKind, Partial<Record<LineKey, readonly string[]>>> = {
  regular: {
    order: ['{m}{n} 주세요', '{m}{n}만 포장이요', '{m}붕어빵 {n}요', '{m}{n} 부탁해요'],
    wait: ['아직인가요?', '조금 걸리네요'],
    good: ['따끈하다, 잘 먹을게요', '감사합니다', '냄새 좋네요'],
    best: ['와, 이거 금빛이네요?', '오늘 최고예요'],
    extra: ['하나 더요? 감사해요!', '덤까지요? 또 올게요'],
    raw: ['속이 좀 덜 익었어요', '조금 덜 구워졌네요'],
    burnt: ['음, 좀 탔네요', '많이 탔어요'],
    leave: ['다음에 올게요', '오늘은 그냥 갈게요'],
    wrongMenu: ['{m}시켰는데요?', '이거 {m}아니잖아요'],
  },
  kid: {
    order: ['{m}붕어빵 {n}요!', '{m}{n} 주세요!'],
    wait: ['배고파…', '언제 나와요?'],
    good: ['맛있다!', '따뜻해!'],
    best: ['반짝반짝해!', '금붕어빵이다!'],
    extra: ['우와, 하나 더!', '최고예요!'],
    noExtra: ['하나 더 주지…', '에이, 한 개뿐이야?'],
    raw: ['말랑말랑해…'],
    burnt: ['까매…'],
    leave: ['엄마한테 갈래'],
    wrongMenu: ['{m}아니야…'],
  },
  office: {
    order: ['{m}{n}요, 빨리요', '{m}{n} 주세요, 급해서요'],
    wait: ['회의 늦겠다…', '아직이에요?'],
    good: ['감사합니다, 딱 좋아요', '잘 먹을게요'],
    best: ['오늘 운 좋은데요', '이건 자랑해야겠다'],
    extra: ['센스 있으시네요', '덕분에 힘나요'],
    raw: ['덜 익었네요'],
    burnt: ['탔잖아요'],
    leave: ['더는 못 기다려요'],
    overtaken: ['저 먼저 왔는데요'],
  },
  elder: {
    order: ['{m}{n} 주세요', '{m}{n}만 줘요'],
    wait: ['천천히 해요, 기다릴게요'],
    good: ['잘 구웠네', '옛날 생각나네'],
    best: ['옛날 그 맛이야', '이렇게 고운 건 처음이네'],
    extra: ['고마워요, 또 올게요', '인심이 좋네'],
    raw: ['조금 더 굽지'],
    burnt: ['이건 탔잖아요'],
    leave: ['오늘은 그냥 갈게요'],
  },
  creator: {
    order: ['{m}{n}요! 지금 방송 중이에요', '{m}{n} 주세요, 먹방 찍을게요'],
    wait: ['시청자분들이 기다려요', '라이브 중이라서요'],
    good: ['이 집 맛집이네요', '바삭바삭해요'],
    best: ['금붕어빵 실화예요?', '이거 클립 각이에요'],
    extra: ['구독자분들 보이시죠?', '서비스까지 최고예요'],
    raw: ['이것도 맛있어요'],
    burnt: ['바삭하네요'],
    leave: ['다음 방송 때 올게요'],
  },
  reviewer: {
    order: ['{m}{n} 주세요, 리뷰 쓰러 왔어요', '{m}{n}요. 맛 좀 볼게요'],
    wait: ['대기 시간도 적을게요'],
    good: ['별 넷 드릴게요', '기본기가 좋네요'],
    best: ['별 다섯 개요!', '올해의 붕어빵이네요'],
    extra: ['서비스 좋다고 쓸게요'],
    raw: ['식감이 아쉽네요'],
    burnt: ['탄 맛이 나요'],
    leave: ['별 하나…'],
  },
};

/** 그 상황의 대사 하나. 없으면 동네 손님 대사를 빌린다. menu는 대사에 넣을 메뉴 이름(없으면 빼고 말한다) */
export function pickLine(kind: CustomerKind, key: LineKey, count = 1, menu = ''): string {
  const options = LINES[kind][key] ?? LINES.regular[key] ?? [''];
  const line = options[Math.floor(Math.random() * options.length)] ?? '';
  return line.replace('{n}', COUNT_WORDS[count] ?? `${count}개`).replace('{m}', menu ? `${menu} ` : '');
}

/** 판매 결과의 대사 상황. 주문과 다른 메뉴를 받았으면 그 말부터 한다 */
export function saleLineKey(kind: CustomerKind, result: SaleResult, given: readonly Quality[], extra: boolean, wrongMenu = false): LineKey {
  if (wrongMenu) return 'wrongMenu';
  if (result === 'best') return 'best';
  if (result === 'good') return extra ? 'extra' : 'good';
  if (kind === 'kid' && !extra && result === 'meh' && !given.some((q) => q === 'raw' || q === 'burnt')) return 'noExtra';
  return given.includes('burnt') ? 'burnt' : 'raw';
}
