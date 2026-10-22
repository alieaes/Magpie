// 효과음. 녹음 파일 없이 Web Audio로 그 자리에서 합성한다(원작 효과음을 가져오지 않는다).
// 음소거·음량은 처음에 셸이 넘기고(GrowthMountOptions.muted·volume), 게임 안 설정(settings.ts)에서 바꾼다.
// 근거: docs/design/261022-09-snack-bar.md §8-3

const MASTER_GAIN = 0.8;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted: boolean;
  private volume: number;

  constructor(muted: boolean, volume: number) {
    this.muted = muted;
    this.volume = Math.min(1, Math.max(0, volume));
  }

  /** 지금 주 음량 */
  private level(): number {
    return this.muted ? 0 : MASTER_GAIN * this.volume;
  }

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
      this.master.gain.value = this.level();
      this.master.connect(compressor);
      this.noise = this.makeNoise(1);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 소리를 켜거나 끈다 */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevel();
  }

  /** 소리가 꺼져 있는지 */
  isMuted(): boolean {
    return this.muted;
  }

  /** 지금 음량 (0~1) */
  getVolume(): number {
    return this.volume;
  }

  /** 음량을 바꾼다 (0~1) */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyLevel();
  }

  /** 주 음량을 지금 설정으로 부드럽게 맞춘다 */
  private applyLevel(): void {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.02);
  }

  /** 오디오를 닫는다 */
  destroy(): void {
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

  /** 짧은 잡음 한 번 */
  private burst(duration: number, type: BiquadFilterType, from: number, to: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(g).connect(this.master);
    source.start(t, Math.random() * 0.5);
    source.stop(t + duration + 0.05);
  }

  /** 음 하나 */
  private tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** 손님이 들어옴: 문 종 "딸랑" */
  bell(): void {
    this.tone(1318.5, 0.25, 'sine', 0.1);
    this.tone(1046.5, 0.35, 'sine', 0.08, 0.1);
  }

  /** 조리대 연타: 메뉴마다 다른 짧은 소리 (떡볶이 보글, 김밥 도마 톡, 순대 칼질, 라면 끓는 소리, 튀김 지글) */
  cook(menu: number): void {
    switch (menu) {
      case 0:
        this.tone(220, 0.08, 'sine', 0.16, 0, 330);
        this.tone(260, 0.06, 'sine', 0.1, 0.05, 390);
        break;
      case 1:
        this.tone(520, 0.05, 'triangle', 0.18);
        this.burst(0.04, 'bandpass', 2500, 1800, 0.2);
        break;
      case 2:
        this.burst(0.06, 'highpass', 5000, 2500, 0.3);
        this.tone(700, 0.04, 'square', 0.06);
        break;
      case 3:
        this.burst(0.12, 'lowpass', 1200, 600, 0.3);
        this.tone(300, 0.07, 'sine', 0.1, 0.03, 420);
        break;
      default:
        this.burst(0.16, 'bandpass', 5200, 4200, 0.25);
        break;
    }
  }

  /** 음식 완성 "딩" */
  done(): void {
    this.tone(1046.5, 0.14, 'triangle', 0.2);
    this.tone(1568, 0.22, 'sine', 0.14, 0.06);
  }

  /** 물·단무지 담기 "졸졸" */
  pour(): void {
    this.burst(0.18, 'bandpass', 1800, 900, 0.3);
  }

  /** 접시 내려놓기 "톡" */
  serve(): void {
    this.tone(660, 0.07, 'triangle', 0.2, 0, 880);
  }

  /** 행주 "슥". 다 닦으면 반짝 */
  wipe(clean: boolean): void {
    this.burst(0.12, 'bandpass', 3000, 1500, 0.28);
    if (clean) [1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.1, 0.06 + i * 0.06));
  }

  /** 계산 "짤랑". 기분이 최고면 한 음 더 */
  coin(best: boolean): void {
    this.tone(1760, 0.1, 'square', 0.06);
    this.tone(2349, 0.16, 'square', 0.05, 0.06);
    if (best) this.tone(3136, 0.2, 'sine', 0.08, 0.14);
  }

  /** 안 시킨 것을 냄: 손님이 고개 젓는 짧은 "음-음" */
  refuse(): void {
    this.tone(330, 0.1, 'triangle', 0.12);
    this.tone(262, 0.14, 'triangle', 0.12, 0.13);
  }

  /** 기분 나빠짐·화나서 나감: 짧게 내려가는 두 음 */
  angry(): void {
    this.tone(330, 0.16, 'square', 0.08);
    this.tone(220, 0.24, 'square', 0.08, 0.14);
  }

  /** 접시 버리기 "달그락" */
  clatter(): void {
    this.burst(0.08, 'highpass', 6000, 3000, 0.3);
    this.tone(1200, 0.05, 'square', 0.05, 0.04);
    this.tone(900, 0.05, 'square', 0.05, 0.09);
  }

  /** 안 되는 동작 */
  deny(): void {
    this.tone(200, 0.1, 'square', 0.08);
  }

  /** 버튼 */
  click(): void {
    this.tone(1200, 0.04, 'triangle', 0.12);
  }

  /** 마감·레벨업·새 직원 팡파르 */
  fanfare(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.18, i * 0.11));
  }

  /** 강화 구매 */
  upgrade(): void {
    [783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.16, i * 0.07));
  }
}
