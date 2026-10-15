// 사과게임 소리. Web Audio로 음을 직접 합성한다(음원 파일 없음). 악보는 music.ts에 있다.
// 근거: docs/design/261016-01-apple-sound.md

import { END_NOTES, midiToFreq, notesAt, popNotes, stepSeconds, volumeGain } from './music';

// 전체 음량. 귀가 아프지 않게 작게 잡는다
const MASTER_GAIN = 0.5;
// 배경음을 얼마나 앞서서 예약해 둘지(초)와 확인 간격(ms). 탭이 잠깐 느려져도 끊기지 않게 한다
const LOOKAHEAD = 0.3;
const SCHEDULE_EVERY_MS = 60;

/** 사과게임 소리 묶음 */
export class AppleAudio {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null;
  private muted: boolean;
  private volume: number;
  private urgent = false;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor(muted: boolean, volume: number) {
    this.muted = muted;
    this.volume = volume;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    // 소리를 못 쓰는 환경이면 조용히 넘어간다. 게임은 소리 없이도 돌아야 한다
    this.ctx = Ctor ? new Ctor() : null;
    this.master = this.ctx ? this.ctx.createGain() : null;
    if (this.ctx && this.master) {
      this.master.gain.value = this.level();
      this.master.connect(this.ctx.destination);
    }
  }

  /** 브라우저가 멈춰 둔 소리를 깨운다. 사용자 입력 안에서 부른다 */
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** 음소거를 켜거나 끈다 */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevel();
  }

  /** 음량을 바꾼다 (0~1) */
  setVolume(volume: number): void {
    this.volume = volume;
    this.applyLevel();
  }

  /** 지금 마스터 음량 */
  private level(): number {
    return this.muted ? 0 : MASTER_GAIN * volumeGain(this.volume);
  }

  /** 마스터 음량을 부드럽게 맞춘다 (뚝 끊기는 잡음 방지) */
  private applyLevel(): void {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.02);
  }

  /** 사과를 count개 지웠을 때: 경쾌한 퐁 */
  pop(count: number): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const n of popNotes(count)) this.tone(midiToFreq(n.midi), now + n.delay, 0.16, 'sine', 0.3, midiToFreq(n.midi) * 1.04);
  }

  /** 합이 10이 아닐 때: 낮고 짧은 툭 */
  miss(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    this.tone(330, now, 0.2, 'triangle', 0.4, 220);
    this.tone(311, now + 0.07, 0.2, 'triangle', 0.3, 207);
  }

  /** 판이 끝났을 때: 올라가는 4음 */
  end(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const n of END_NOTES) this.tone(midiToFreq(n.midi), now + n.delay, 0.5, 'triangle', 0.3);
  }

  /** 배경음을 처음부터 튼다 */
  startBgm(): void {
    if (!this.ctx || this.timer !== null) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), SCHEDULE_EVERY_MS);
    this.schedule();
  }

  /** 긴박한 곡으로 바꾼다. 곡의 같은 자리에서 이어서 빨라진다 */
  setUrgent(on: boolean): void {
    this.urgent = on;
  }

  /** 배경음을 멈춘다. 이미 예약된 음은 짧게 남을 수 있다 */
  stopBgm(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** 모든 소리를 끄고 오디오를 닫는다 */
  destroy(): void {
    this.stopBgm();
    void this.ctx?.close().catch(() => undefined);
  }

  /** 앞으로 LOOKAHEAD초 안에 칠 음을 예약한다 */
  private schedule(): void {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const len = stepSeconds(this.urgent);
      for (const note of notesAt(this.step, this.urgent)) {
        this.tone(midiToFreq(note.midi), this.nextTime, note.steps * len, note.wave, note.gain);
      }
      this.nextTime += len;
      this.step += 1;
    }
  }

  /** 음 하나. 짧게 올렸다가 지수적으로 줄이는 엔벨로프. glideTo가 있으면 그 주파수로 미끄러진다 */
  private tone(freq: number, start: number, duration: number, wave: OscillatorType, gain: number, glideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}
