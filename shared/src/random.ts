// 시드 난수. 게임 로직(판 만들기)이 쓴다. 같은 시드면 브라우저·Node 어디서든 같은 수열이 나와야 한다.
// 그래서 정수 연산(Math.imul, 비트 연산)만 쓴다. 근거: docs/design/261006-08-play-submission.md §3

/** 문자열을 32비트 정수 4개로 섞는다 (cyrb128). 시드 문자열 → 난수 생성기 초기 상태 */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** 32비트 정수를 왼쪽으로 돌린다 */
function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** 시드로 만드는 결정적 난수 생성기 (xoshiro128**) */
export class SeededRandom {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: string) {
    const [a, b, c, d] = hash128(seed);
    this.s0 = a;
    this.s1 = b;
    this.s2 = c;
    // 상태가 전부 0이면 계속 0만 나오므로 막는다
    this.s3 = a === 0 && b === 0 && c === 0 && d === 0 ? 1 : d;
  }

  /** 다음 부호 없는 32비트 정수 (0 ~ 2^32-1) */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** min 이상 max 이하의 정수 */
  int(min: number, max: number): number {
    return min + (this.nextUint32() % (max - min + 1));
  }
}

/**
 * 새 시드를 만든다: 무작위 16바이트를 16진 문자열 32자로.
 * 게임 로직 안에서는 부르지 않는다. 판을 시작할 때 서버(기록 모드)나 셸(연습 모드)이 만든다.
 */
export function randomSeed(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
