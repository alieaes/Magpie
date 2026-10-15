// 소리의 "악보" 부분. 어떤 음을 언제 낼지만 정하고, 실제 소리는 만들지 않는다(순수 계산이라 테스트할 수 있다).
// 근거: docs/design/261016-01-apple-sound.md §2

/** 소리 하나. midi는 음 높이(60 = 가운데 도), steps는 길이(스텝 수) */
export interface NoteSpec {
  midi: number;
  steps: number;
  wave: OscillatorType;
  gain: number;
}

/** 한 곡의 길이(스텝). 8스텝 한 마디 × 4마디 */
export const LOOP_STEPS = 32;

// 마디마다 C - Am - F - G. 베이스 근음(마디 앞 박과 가운데 박에 친다)
const BASS_ROOTS = [48, 45, 41, 43];
// 멜로디. null은 쉼표. 도·레·미·솔·라 위주라 어디서 끊겨도 어색하지 않다
const MELODY: (number | null)[] = [
  67, null, 64, null, 67, 69, 67, null,
  69, null, 64, null, 69, 72, 69, null,
  69, null, 67, null, 64, null, 60, null,
  67, 64, 62, null, 64, 62, 60, null,
];

/** 기본 곡은 느긋하게, 긴박한 곡은 빠르게. 한 스텝(8분음표)의 길이(초) */
export function stepSeconds(urgent: boolean): number {
  return 60 / (urgent ? 156 : 112) / 2;
}

/** 곡의 step번째 스텝에서 낼 음들. 긴박 모드는 같은 곡을 온음 높이고 베이스를 매 박 두드린다 */
export function notesAt(step: number, urgent: boolean): NoteSpec[] {
  const i = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(i / 8);
  const beat = i % 8;
  const shift = urgent ? 2 : 0;
  const notes: NoteSpec[] = [];

  const lead = MELODY[i];
  if (lead !== null && lead !== undefined) {
    notes.push({ midi: lead + shift, steps: 1.6, wave: urgent ? 'square' : 'triangle', gain: urgent ? 0.05 : 0.11 });
  }
  // 기본: 마디 앞 박과 가운데 박. 긴박: 2스텝마다 눌러서 몰아치는 느낌
  const bassHit = urgent ? beat % 2 === 0 : beat === 0 || beat === 4;
  if (bassHit) {
    const root = BASS_ROOTS[bar] ?? 48;
    notes.push({ midi: root - 12 + shift, steps: urgent ? 1.6 : 3.2, wave: 'sine', gain: 0.2 });
  }
  return notes;
}

/** 음 높이(midi) → 주파수(Hz). 가온 라(69) = 440Hz */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

// 터짐 소리에 쓰는 음계 (도 장조 5음). 한 번에 많이 지울수록 높은 음에서 시작한다
const POP_SCALE = [72, 74, 76, 79, 81, 84];

/** 한 번에 count개를 지웠을 때 터짐 소리가 내는 음들(시작 지연 초 포함). 3개 이상이면 올라가는 화음을 덧붙인다 */
export function popNotes(count: number): { midi: number; delay: number }[] {
  const level = Math.min(POP_SCALE.length - 1, Math.max(0, Math.floor((count - 2) / 2)));
  const base = POP_SCALE[level] ?? 72;
  const notes = [
    { midi: base, delay: 0 },
    { midi: base + 7, delay: 0.055 },
  ];
  if (count >= 4) notes.push({ midi: base + 12, delay: 0.11 });
  return notes;
}
