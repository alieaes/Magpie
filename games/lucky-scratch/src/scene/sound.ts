// 효과음. 녹음 파일 없이 Web Audio로 그 자리에서 합성한다(내려받을 파일이 없고, 상용 효과음을 가져오지 않는다).
// 근거: docs/design/261016-02-lucky-scratch.md §3-5, §3-7

const MUTE_KEY = 'magpie.lucky-scratch.muted';

/** 저장해 둔 소리 끔 여부. 저장소를 못 쓰면 켜짐 */
function loadMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 소리 끔 여부를 저장한다. 실패해도 무시 */
function saveMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // 사생활 보호 모드 등에서는 저장하지 않는다
  }
}

/** 음 이름 대신 쓰는 주파수(Hz) */
const NOTE = {
  C4: 261.63,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  E6: 1318.5,
  G6: 1568.0,
} as const;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private scratchGain: GainNode | null = null;
  private scratchFilter: BiquadFilterNode | null = null;
  private scratchSource: AudioBufferSourceNode | null = null;
  private scratchStopTimer: ReturnType<typeof setTimeout> | null = null;
  muted = loadMuted();

  /** 오디오를 연다. 사용자가 누른 직후에 불러야 브라우저가 허락한다. 여러 번 불러도 된다 */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      compressor.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(compressor);
      this.noise = this.makeNoise(2);
      this.setupScratch();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 소리 켜기·끄기를 바꾸고 저장한다 */
  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /** 오디오를 닫는다 */
  destroy(): void {
    if (this.scratchStopTimer) clearTimeout(this.scratchStopTimer);
    this.scratchSource?.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  /** 흰 잡음 버퍼 */
  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** 긁는 소리 회로: 계속 도는 잡음 → 고역 통과 → 대역 통과 → 음량(평소 0) */
  private setupScratch(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1400;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3800;
    band.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(highpass).connect(band).connect(gain).connect(this.master!);
    source.start();
    this.scratchSource = source;
    this.scratchFilter = band;
    this.scratchGain = gain;
  }

  /**
   * 긁는 중. speed는 붓이 한 이벤트 사이에 움직인 거리(캔버스 픽셀).
   * 움직임에 맞춰 바로 커지고, 이벤트가 끊기면 곧바로 작아진다.
   */
  scratch(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.scratchGain || !this.scratchFilter) return;
    const now = ctx.currentTime;
    const level = Math.min(0.55, 0.12 + speed * 0.012) * (0.75 + Math.random() * 0.5);
    this.scratchGain.gain.setTargetAtTime(level, now, 0.008);
    this.scratchFilter.frequency.setTargetAtTime(3000 + Math.min(speed, 80) * 30 + Math.random() * 600, now, 0.02);
    if (this.scratchStopTimer) clearTimeout(this.scratchStopTimer);
    this.scratchStopTimer = setTimeout(() => this.scratchEnd(), 70);
  }

  /** 긁기를 멈췄다 */
  scratchEnd(): void {
    if (this.scratchStopTimer) clearTimeout(this.scratchStopTimer);
    this.scratchStopTimer = null;
    if (this.ctx && this.scratchGain) this.scratchGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
  }

  /** 잡음 한 번: 대역 통과 주파수를 from → to로 옮기며 짧게 */
  private noiseBurst(start: number, duration: number, from: number, to: number, volume: number, q = 1.2): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(from, start);
    band.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(band).connect(gain).connect(this.master!);
    source.start(start, Math.random());
    source.stop(start + duration + 0.05);
  }

  /** 음 하나: 파형, 주파수, 시작, 길이, 음량. 빠르게 올라가 지수적으로 줄어든다 */
  private tone(type: OscillatorType, freq: number, start: number, duration: number, volume: number, lowpass = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let node: AudioNode = osc;
    if (lowpass > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(this.master!);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** 지금 소리를 낼 수 있으면 오디오 시각, 아니면 null */
  private now(): number | null {
    if (!this.ctx || !this.master || this.muted) return null;
    return this.ctx.currentTime;
  }

  /** 칸 은박이 저절로 벗겨질 때 "샥" */
  peel(): void {
    const t = this.now();
    if (t === null) return;
    this.noiseBurst(t, 0.14, 2200, 7000, 0.35, 0.8);
  }

  /** 버튼 "톡" */
  click(): void {
    const t = this.now();
    if (t === null) return;
    this.tone('sine', 1400, t, 0.05, 0.18);
    this.tone('triangle', 700, t, 0.04, 0.1);
  }

  /** 누를 수 없는 버튼 "툭" */
  deny(): void {
    const t = this.now();
    if (t === null) return;
    this.tone('square', 180, t, 0.09, 0.08, 900);
  }

  /** 동전 "띵". step이 클수록 음이 조금씩 올라간다 */
  coin(step = 0): void {
    const t = this.now();
    if (t === null) return;
    const up = 2 ** (Math.min(step, 12) / 24);
    this.tone('sine', NOTE.E6 * up, t, 0.22, 0.22);
    this.tone('sine', NOTE.G6 * up * 1.335, t + 0.045, 0.32, 0.16);
    this.tone('triangle', NOTE.E5 * up, t, 0.08, 0.06);
  }

  /** 구매 "철컥-칭" */
  buy(): void {
    const t = this.now();
    if (t === null) return;
    this.noiseBurst(t, 0.06, 1800, 900, 0.4, 2);
    this.tone('square', 220, t, 0.05, 0.08, 1200);
    this.tone('sine', 2637, t + 0.08, 0.5, 0.2);
    this.tone('sine', 3136, t + 0.11, 0.6, 0.16);
  }

  /** 꽝: 도장 "쿵" + 낮게 내려가는 두 음 */
  lose(): void {
    const t = this.now();
    if (t === null) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.3);
    this.noiseBurst(t, 0.08, 900, 300, 0.3, 0.7);
    this.tone('triangle', NOTE.E4, t + 0.2, 0.22, 0.14, 1800);
    this.tone('triangle', NOTE.C4 * 0.94, t + 0.42, 0.4, 0.14, 1400);
  }

  /** 5등·4등: 짧고 밝은 아르페지오 */
  winSmall(): void {
    const t = this.now();
    if (t === null) return;
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => this.tone('triangle', f, t + i * 0.065, 0.28, 0.16));
  }

  /** 3등: 더 긴 아르페지오와 반짝임 */
  winMedium(): void {
    const t = this.now();
    if (t === null) return;
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => this.tone('triangle', f, t + i * 0.07, 0.4, 0.16));
    [NOTE.G5, NOTE.C6].forEach((f) => this.tone('sine', f * 2, t + 0.4, 0.6, 0.06));
    for (let i = 0; i < 6; i += 1) this.tone('sine', 2400 + Math.random() * 2400, t + 0.45 + i * 0.05, 0.12, 0.05);
  }

  /** 2등·1등: 팡파르(화음 진행) + 동전 쏟아짐 */
  winBig(): void {
    const t = this.now();
    if (t === null) return;
    const chords: [number, number[]][] = [
      [0, [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5]],
      [0.18, [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5]],
      [0.36, [NOTE.F5 / 2, NOTE.A4, NOTE.C5, NOTE.F5]],
      [0.6, [NOTE.G4, NOTE.D5, NOTE.G5 / 2, NOTE.G5]],
      [0.84, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6]],
    ];
    for (const [offset, notes] of chords) {
      const long = offset >= 0.84 ? 1.3 : 0.2;
      for (const f of notes) {
        this.tone('sawtooth', f, t + offset, long, 0.06, 2600);
        this.tone('triangle', f, t + offset, long, 0.07);
      }
    }
    for (let i = 0; i < 14; i += 1) this.tone('sine', NOTE.E6 * (1 + Math.random() * 0.6), t + 1 + i * 0.06, 0.2, 0.08);
  }
}
