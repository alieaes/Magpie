// 효과음. 녹음 파일 없이 Web Audio로 그 자리에서 합성한다(원작·상용 효과음을 가져오지 않는다).
// 음소거·음량은 셸의 플레이 막대가 정한다(GrowthMountOptions.muted·volume, GrowthInstance.setMuted·setVolume).
// 근거: docs/design/261021-01-fish-bun.md §5-4

const MASTER_GAIN = 0.8;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sizzleGain: GainNode | null = null;
  private pumpGain: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
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
      this.noise = this.makeNoise(2);
      this.sizzleGain = this.loopNoise('bandpass', 5200, 0.7);
      this.pumpGain = this.loopNoise('lowpass', 900, 0.8);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 소리를 켜거나 끈다 */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevel();
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
    for (const s of this.sources) s.stop();
    this.sources = [];
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

  /** 계속 도는 잡음 회로(평소 음량 0). 지글지글·펌프 소리에 쓴다 */
  private loopNoise(type: BiquadFilterType, frequency: number, q: number): GainNode {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master!);
    source.start();
    this.sources.push(source);
    return gain;
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
    source.start(t, Math.random());
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

  /** 지글지글: 굽는 빵틀 수(0~12)에 따라 커진다 */
  setSizzle(baking: number): void {
    if (this.ctx && this.sizzleGain) this.sizzleGain.gain.setTargetAtTime(Math.min(0.14, baking * 0.018), this.ctx.currentTime, 0.15);
  }

  /** 펌프질 소리 켜기·끄기 */
  setPumping(on: boolean): void {
    if (this.ctx && this.pumpGain) this.pumpGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }

  /** 반죽 붓기 "촥" */
  pour(): void {
    this.burst(0.18, 'lowpass', 2400, 500, 0.5);
  }

  /** 뒤집기: 무쇠 틀 닫히는 "착" */
  flip(): void {
    this.tone(180, 0.09, 'square', 0.12);
    this.burst(0.06, 'highpass', 3000, 1500, 0.35);
  }

  /** 꺼내기 "톡". 황금이면 반짝이는 소리 */
  take(golden: boolean): void {
    this.tone(660, 0.08, 'triangle', 0.22, 0, 880);
    if (golden) [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.18, 0.05 + i * 0.06));
  }

  /** 빵이 탈 때 "치익" */
  burn(): void {
    this.burst(0.5, 'highpass', 4000, 1200, 0.18);
  }

  /** 황금 후보가 반짝이기 시작할 때 */
  shine(): void {
    this.tone(1568, 0.12, 'sine', 0.12);
    this.tone(2093, 0.16, 'sine', 0.1, 0.07);
  }

  /** 판매 "띵". 콤보가 오를수록 음이 올라간다 */
  sale(combo: number): void {
    const base = 880 * 2 ** (Math.min(combo, 12) / 12);
    this.tone(base, 0.22, 'sine', 0.25);
    this.tone(base * 1.5, 0.3, 'sine', 0.12, 0.06);
    this.burst(0.05, 'highpass', 6000, 4000, 0.2);
  }

  /** 손님이 화나서 떠남: 짧게 내려가는 두 음 */
  angry(): void {
    this.tone(330, 0.16, 'square', 0.08);
    this.tone(220, 0.24, 'square', 0.08, 0.14);
  }

  /** 손님이 들어옴: 문 종 */
  bell(): void {
    this.tone(1318.5, 0.25, 'sine', 0.1);
    this.tone(1046.5, 0.35, 'sine', 0.08, 0.1);
  }

  /** 안 되는 동작 */
  deny(): void {
    this.tone(200, 0.1, 'square', 0.08);
  }

  /** 진상 손님이 빵틀을 깸: "쾅" 낮은 음 + 깨지는 "쨍그랑" */
  crash(): void {
    this.tone(90, 0.3, 'square', 0.22, 0, 50);
    this.burst(0.35, 'highpass', 7000, 2500, 0.45);
    [2637, 3136, 2349].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.08, 0.04 + i * 0.05));
  }

  /** 깨진 빵틀 고치기 망치 "땅". 다 고치면 밝은 음 */
  hammer(fixed: boolean): void {
    this.tone(520, 0.08, 'square', 0.14, 0, 380);
    this.burst(0.05, 'bandpass', 3000, 2000, 0.3);
    if (fixed) [784, 1046.5].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.14, 0.08 + i * 0.07));
  }

  /** 버튼 */
  click(): void {
    this.tone(1200, 0.04, 'triangle', 0.12);
  }

  /** 마감·정산·레벨업 팡파르 */
  fanfare(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.18, i * 0.11));
  }

  /** 강화 구매 */
  upgrade(): void {
    [783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.16, i * 0.07));
  }
}
