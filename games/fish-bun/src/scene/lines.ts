// 손님 대사. 짧고 요즘 말투, 존댓말 기본(꼬마만 반말). 애교체·사투리·성별 호칭·유행어는 쓰지 않는다.
// 진상 손님은 무례하지만 욕설은 쓰지 않는다. 관광객은 영어·일본어로 말한다.
// 대사 고르기는 연출이라 로직(서버 재계산)과 무관하다.
// 근거: docs/design/261021-02-fish-bun-customers.md §3, docs/design/261022-03-fish-bun-special-customers.md §1-2~§1-4

import { MENUS, type CustomerKind, type Lang, type Menu, type Quality, type SaleResult } from '../logic/rules';

/** 대사 상황 */
export type LineKey = 'order' | 'wait' | 'good' | 'best' | 'extra' | 'noExtra' | 'raw' | 'burnt' | 'leave' | 'overtaken' | 'wrongMenu';

/** 주문 개수 말 ("두 개") */
const COUNT_WORDS = ['', '한 개', '두 개', '세 개', '네 개', '다섯 개', '여섯 개'];

/**
 * {n}은 주문 개수 말로, {m}은 메뉴 이름과 띄어쓰기("슈크림 ")로, {M}은 메뉴 이름("슈크림")으로 바뀐다.
 * 메뉴가 팥 하나뿐인 날은 {m}이 빈 말이다. 조사가 메뉴 이름의 받침에 따라 달라지는 말은 쓰지 않는다
 */
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
  // 수수께끼 손님의 주문은 RIDDLES에서 고른다
  riddler: {
    wait: ['힌트는 다 드렸어요', '음, 어려운가요?'],
    good: ['정답이에요!', '역시 알아들으셨네요'],
    best: ['정답에 금빛까지!', '완벽한 정답이에요'],
    extra: ['정답에 덤까지요?'],
    raw: ['정답인데 덜 익었네요'],
    burnt: ['정답인데 탔네요'],
    leave: ['다음에 다시 낼게요'],
    wrongMenu: ['{M}, 그게 정답이었는데…', '아쉽네요, 정답은 {M}!'],
  },
  // 관광객의 대사는 TOURIST_LINES에서 고른다
  tourist: {},
  rude: {
    order: ['{m}{n}, 빨리요', '{m}{n}요. 얼른요'],
    wait: ['아직이에요? 참 나', '얼마나 걸려요?'],
    good: ['흠, 나쁘지 않네', '뭐, 괜찮네요'],
    best: ['흠, 이건 좀 괜찮네'],
    extra: ['흠, 덤은 받죠'],
    raw: ['장사 이렇게 할 거예요?!', '덜 익었잖아요!'],
    burnt: ['장사 이렇게 할 거예요?!', '탔잖아요, 참 나'],
    leave: ['에잇, 됐어요!', '장사 이렇게 할 거예요?!'],
    wrongMenu: ['{m}시켰다고요!'],
  },
};

/** 수수께끼 손님의 주문: 메뉴를 돌려 말한다. 같은 말이 두 메뉴에 들어맞지 않게 쓴다 (MENUS 순서) */
const RIDDLES: readonly (readonly string[])[] = [
  ['할머니 댁에서 먹던 맛으로요', '까맣고 달콤한 거요', '제일 기본으로 주세요', '겨울 하면 생각나는 그 맛'],
  ['노랗고 부드러운 거요', '빵집 크림빵 같은 걸로', '구름처럼 말랑한 맛이요'],
  ['치즈가 쭉 늘어나는 거요', '단 거 말고 짭짤한 걸로', '이탈리아 사람이 좋아할 맛'],
];

/** 관광객이 말하는 메뉴 이름과 개수 말 */
const TOURIST_WORDS: Record<Lang, { menus: readonly string[]; counts: readonly string[] }> = {
  en: { menus: ['red bean', 'custard', 'pizza'], counts: ['', 'one', 'two', 'three', 'four', 'five'] },
  ja: { menus: ['あんこ', 'カスタード', 'ピザ'], counts: ['', 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ'] },
};

/** 관광객 대사. {menu}는 메뉴 이름, {count}는 개수 말 */
const TOURIST_LINES: Record<Lang, Partial<Record<LineKey, readonly string[]>>> = {
  en: {
    order: ['{menu}, {count} please!', '{count} {menu}, thanks!', 'Can I get {count} {menu}?'],
    wait: ['Is it ready?', 'Still waiting…'],
    good: ['Thank you!', 'So good!'],
    best: ['Wow, golden!', 'Amazing!'],
    extra: ['A bonus? Thanks!'],
    raw: ['A bit soft inside…'],
    burnt: ['A bit burnt…'],
    leave: ['I have to go…'],
    wrongMenu: ['Oh, I wanted {menu}…'],
  },
  ja: {
    order: ['{menu}、{count}ください', '{menu}を{count}お願いします', '{menu}、{count}！'],
    wait: ['まだかな…'],
    good: ['ありがとう！', 'おいしい！'],
    best: ['わあ、金色だ！'],
    extra: ['おまけ？うれしい！'],
    raw: ['ちょっと生っぽい…'],
    burnt: ['ちょっとこげてる…'],
    leave: ['もう行かなきゃ…'],
    wrongMenu: ['あ、{menu}がよかった…'],
  },
};

/** 목록에서 하나를 고른다 */
function pick(options: readonly string[]): string {
  return options[Math.floor(Math.random() * options.length)] ?? '';
}

export interface LineOptions {
  /** 주문 개수 */
  count?: number;
  /** 대사에 넣을 메뉴. null이면 메뉴를 빼고 말한다(메뉴가 팥 하나뿐인 날) */
  menu?: Menu | null;
  /** 관광객이 말하는 말 */
  lang?: Lang | null;
}

/** 그 상황의 대사 하나. 없으면 동네 손님 대사를 빌린다. 수수께끼 손님의 주문은 수수께끼, 관광객은 그 나라 말 */
export function pickLine(kind: CustomerKind, key: LineKey, { count = 1, menu = null, lang = null }: LineOptions = {}): string {
  if (kind === 'tourist' && lang) {
    const words = TOURIST_WORDS[lang];
    const line = pick(TOURIST_LINES[lang][key] ?? TOURIST_LINES[lang].good ?? ['']);
    // 문장 첫 글자는 대문자 (일본어는 그대로)
    return capitalize(line.replace('{menu}', words.menus[menu ?? 0] ?? '').replace('{count}', words.counts[count] ?? String(count)));
  }
  if (kind === 'riddler' && key === 'order') return pick(RIDDLES[menu ?? 0] ?? RIDDLES[0]!);
  const line = pick(LINES[kind][key] ?? LINES.regular[key] ?? ['']);
  const name = menu === null ? '' : (MENUS[menu]?.name ?? '');
  return line
    .replace('{n}', COUNT_WORDS[count] ?? `${count}개`)
    .replace('{m}', name ? `${name} ` : '')
    .replace('{M}', name);
}

/** 첫 글자를 대문자로 (영어 문장) */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 판매 결과의 대사 상황. 주문과 다른 메뉴를 받았으면 그 말부터 한다 */
export function saleLineKey(kind: CustomerKind, result: SaleResult, given: readonly Quality[], extra: boolean, wrongMenu = false): LineKey {
  if (wrongMenu) return 'wrongMenu';
  if (result === 'best') return 'best';
  if (result === 'good') return extra ? 'extra' : 'good';
  if (kind === 'kid' && !extra && result === 'meh' && !given.some((q) => q === 'raw' || q === 'burnt')) return 'noExtra';
  return given.includes('burnt') ? 'burnt' : 'raw';
}
