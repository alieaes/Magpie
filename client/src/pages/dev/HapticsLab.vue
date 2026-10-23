<script setup lang="ts">
// 개발용 진동 시험 화면 (/dev/haptics, 개발 빌드에서만). 폰으로 열어 어떤 방식이 울리는지 직접 확인한다.
// 특히 iOS 26.5 이상에서 "손가락이 직접 누르는 숨은 스위치"가 울리는지, 그 스위치를 Phaser 캔버스 위에 덮었을 때
// Phaser가 탭·끌기를 제대로(두 번 받지 않고) 받는지를 본다. 근거: docs/design/261023-01-haptics.md §6
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Phaser from 'phaser';
import { HAPTIC_PATTERNS, haptic, hapticSupport, iosSwitchTick, type HapticKind } from '@magpie/shared/haptics';
import { useHaptics } from '../../composables/useHaptics';

type InputMode = 'canvas' | 'host';

const KINDS = Object.keys(HAPTIC_PATTERNS) as HapticKind[];
const { enabled: hapticsOn, toggle: toggleHaptics } = useHaptics();

const info = ref<{ label: string; value: string }[]>([]);
const domSwitchCount = ref(0);
const domBox = ref<HTMLElement | null>(null);
const phaserHost = ref<HTMLElement | null>(null);
const mode = ref<InputMode>('canvas');
const stats = ref({ down: 0, downTouch: 0, downMouse: 0, outside: 0, up: 0, move: 0, overlay: 0 });
const log = ref<string[]>([]);
let game: Phaser.Game | null = null;
let startedAt = 0;

/** 기기 정보를 다시 읽는다 (누른 뒤에는 userActivation이 바뀐다) */
function readInfo(): void {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  info.value = [
    { label: 'hapticSupport()', value: hapticSupport() },
    { label: '진동 설정', value: hapticsOn.value ? '켜짐' : '꺼짐' },
    { label: 'navigator.vibrate', value: typeof nav.vibrate === 'function' ? '있음' : '없음' },
    { label: '(pointer: coarse)', value: matchMedia('(pointer: coarse)').matches ? '예' : '아니오' },
    { label: 'userActivation.hasBeenActive', value: nav.userActivation ? String(nav.userActivation.hasBeenActive) : '없음' },
    { label: 'userAgent', value: nav.userAgent },
  ];
}

/** 기록 한 줄 (최근 14줄만) */
function note(text: string): void {
  const ms = Math.round(performance.now() - startedAt);
  log.value = [`${(ms / 1000).toFixed(2)}s  ${text}`, ...log.value].slice(0, 14);
}

/** 공통 함수로 울린다 (기기 판단·설정을 따른다) */
function tryKind(kind: HapticKind): void {
  haptic(kind);
  note(`haptic('${kind}')`);
  readInfo();
}

/** 기기 판단을 건너뛰고 Vibration API를 바로 부른다 */
function rawVibrate(): void {
  const ok = typeof navigator.vibrate === 'function' ? navigator.vibrate([...HAPTIC_PATTERNS.great]) : false;
  note(`navigator.vibrate → ${ok}`);
  readInfo();
}

/** 기기 판단을 건너뛰고 숨긴 스위치를 코드로 누른다 (iOS 26.4까지만 울린다) */
function rawIosClick(): void {
  iosSwitchTick();
  note('숨긴 스위치 코드 클릭');
  readInfo();
}

/** 손가락이 직접 누르는 숨은 스위치를 parent 위에 덮는다. 모양을 지우면 햅틱도 사라진다는 보고가 있어 opacity만 0으로 한다 */
function overlaySwitch(parent: HTMLElement, className: string, onToggle: () => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute('aria-label', '진동 시험 스위치');
  input.className = className;
  input.addEventListener('change', onToggle);
  parent.append(input);
  return input;
}

/** 시험용 Phaser 게임. host 모드는 입력을 게임 칸에서 받고 창 전체 이벤트를 끈다(덮개 위에서 시작한 끌기도 받게) */
function createGame(parent: HTMLElement, inputMode: InputMode): Phaser.Game {
  /** 왼쪽 반은 캔버스 그대로, 오른쪽 반은 덮개 아래 */
  class LabScene extends Phaser.Scene {
    create(): void {
      const { width, height } = this.scale;
      this.add.rectangle(0, 0, width / 2, height, 0x2f6f5e).setOrigin(0);
      this.add.rectangle(width / 2, 0, width / 2, height, 0x7a4b2a).setOrigin(0);
      this.add.text(width / 4, height / 2, '캔버스만', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text((width * 3) / 4, height / 2, '스위치 덮개', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
      this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
        stats.value.down += 1;
        if (p.wasTouch) stats.value.downTouch += 1;
        else stats.value.downMouse += 1;
        note(`Phaser 누름 #${p.id} ${p.wasTouch ? '터치' : '마우스'} (${Math.round(p.x)}, ${Math.round(p.y)})`);
      });
      // 캔버스가 아닌 요소(덮개)에서 시작한 누름은 POINTER_DOWN이 아니라 이 "밖 누름"으로 온다
      this.input.on(Phaser.Input.Events.POINTER_DOWN_OUTSIDE, (p: Phaser.Input.Pointer) => {
        stats.value.outside += 1;
        note(`Phaser 밖 누름 #${p.id} ${p.wasTouch ? '터치' : '마우스'} (${Math.round(p.x)}, ${Math.round(p.y)})`);
      });
      this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
        stats.value.up += 1;
        note(`Phaser 뗌 #${p.id}`);
      });
      this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
        if (p.isDown) stats.value.move += 1;
      });
    }
  }
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 320,
    height: 200,
    backgroundColor: '#1f1d1c',
    banner: false,
    audio: { noAudio: true },
    scene: LabScene,
    input: inputMode === 'host' ? { touch: { target: parent }, mouse: { target: parent }, windowEvents: false } : {},
  });
}

/** 입력 방식을 바꿔 Phaser 시험판을 다시 만든다 */
function setMode(next: InputMode): void {
  mode.value = next;
  stats.value = { down: 0, downTouch: 0, downMouse: 0, outside: 0, up: 0, move: 0, overlay: 0 };
  log.value = [];
  game?.destroy(true);
  game = phaserHost.value ? createGame(phaserHost.value, next) : null;
}

onMounted(() => {
  startedAt = performance.now();
  readInfo();
  if (domBox.value) overlaySwitch(domBox.value, 'cover', () => (domSwitchCount.value += 1));
  if (phaserHost.value) {
    overlaySwitch(phaserHost.value, 'cover half', () => {
      stats.value.overlay += 1;
      note('덮개 스위치 바뀜');
    });
    game = createGame(phaserHost.value, mode.value);
  }
});

onBeforeUnmount(() => {
  game?.destroy(true);
  game = null;
});
</script>

<template>
  <main class="lab">
    <h1>진동 시험 (개발용)</h1>
    <p class="lead">폰으로 열어 버튼을 눌러 보고, 울리는지 손으로 확인한다. 아이폰 최신 버전은 3번이 핵심이다.</p>

    <section>
      <h2>이 기기</h2>
      <dl class="info">
        <template v-for="row in info" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
    </section>

    <section>
      <h2>1. 공통 함수 haptic()</h2>
      <p class="hint">기기 판단과 진동 설정을 따른다. 지원하지 않는 기기(none)면 아무것도 하지 않는다.</p>
      <div class="buttons">
        <button v-for="kind in KINDS" :key="kind" type="button" class="btn" @click="tryKind(kind)">{{ kind }}</button>
        <button type="button" class="btn secondary" @click="toggleHaptics(); readInfo()">진동 {{ hapticsOn ? '끄기' : '켜기' }}</button>
      </div>
    </section>

    <section>
      <h2>2. 직접 부르기 (기기 판단 무시)</h2>
      <div class="buttons">
        <button type="button" class="btn" @click="rawVibrate">navigator.vibrate (great 패턴)</button>
        <button type="button" class="btn" @click="rawIosClick">숨긴 스위치 코드 클릭 (iOS 26.4까지)</button>
      </div>
    </section>

    <section>
      <h2>3. 손가락이 직접 누르는 숨은 스위치 (iOS 26.5 이상 방식)</h2>
      <p class="hint">아래 상자를 톡 눌러 본다. 상자 위에 보이지 않는 스위치가 덮여 있다.</p>
      <div ref="domBox" class="dom-box">여기를 톡 (스위치 바뀜 {{ domSwitchCount }}번)</div>
    </section>

    <section>
      <h2>4. Phaser 캔버스 위 덮개</h2>
      <p class="hint">
        왼쪽은 캔버스 그대로, 오른쪽은 스위치를 덮었다. 오른쪽을 탭·끌기 해 보고 울리는지, Phaser가 누름을 어떻게 받는지(누름·밖 누름, 두 번 받는지), 끌기가 들어오는지 본다.
      </p>
      <div class="buttons">
        <button type="button" class="btn" :class="{ secondary: mode !== 'canvas' }" @click="setMode('canvas')">입력: 캔버스 (기본)</button>
        <button type="button" class="btn" :class="{ secondary: mode !== 'host' }" @click="setMode('host')">입력: 게임 칸 + 창 이벤트 끔</button>
      </div>
      <div ref="phaserHost" class="phaser-host" />
      <p class="stats">
        누름 {{ stats.down }} (터치 {{ stats.downTouch }} · 마우스 {{ stats.downMouse }}) · 밖 누름 {{ stats.outside }} · 뗌 {{ stats.up }} · 끌기 이동 {{ stats.move }} · 덮개 스위치
        {{ stats.overlay }}
      </p>
      <ol class="log">
        <li v-for="(line, i) in log" :key="i">{{ line }}</li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
.lab {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 64px;
}

h1 {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-strong);
}

.lead,
.hint {
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-2);
}

section {
  margin-top: 24px;
}

h2 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-strong);
}

.info {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 13px;
}

.info dt {
  color: var(--text-2);
}

.info dd {
  color: var(--text-strong);
  word-break: break-all;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.btn {
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn.secondary {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
}

.dom-box {
  position: relative;
  display: grid;
  place-items: center;
  height: 96px;
  margin-top: 10px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--text-strong);
  font-weight: 700;
  touch-action: manipulation;
}

.phaser-host {
  position: relative;
  width: 320px;
  max-width: 100%;
  height: 200px;
  margin-top: 10px;
  touch-action: none;
}

.phaser-host :deep(canvas) {
  display: block;
}

/* 숨은 스위치 덮개: 모양은 그대로 두고 보이지만 않게 (모양을 지우면 햅틱도 사라진다는 보고) */
:deep(.cover) {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

:deep(.cover.half) {
  left: 50%;
  width: 50%;
}

.stats {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-strong);
}

.log {
  margin-top: 6px;
  padding-left: 0;
  list-style: none;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--text-2);
}
</style>
