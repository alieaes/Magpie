// 긴 화면 스크롤: 내용 묶음을 휠·끌기로 위아래로 민다.
// 마스크 대신 아래쪽 띠(바탕색)로 넘친 부분을 가리고, 그 위에 고정 버튼을 둔다.

import Phaser from 'phaser';

export interface ScrollOptions {
  scene: Phaser.Scene;
  /** 스크롤될 내용 묶음 (원점이 내용 맨 위) */
  body: Phaser.GameObjects.Container;
  /** 내용이 놓이는 맨 위 y (스크롤 0일 때 body.y) */
  top: number;
  /** 내용 전체 높이 */
  contentH: number;
  /** 보이는 영역 아래 끝 y. 이 아래는 띠가 가리고 고정 버튼이 놓인다 */
  bottom: number;
  /** 화면 전체 폭·높이 */
  width: number;
  height: number;
  /** 띠 바탕색 */
  color: number;
  /** 스크롤바 색 */
  thumb: number;
}

/**
 * 스크롤을 붙이고 띠·스크롤바를 만든다. 반환한 컨테이너를 body 다음에 root에 넣고, 버튼은 그 뒤에 넣는다.
 * 내용이 영역보다 짧으면 스크롤 없이 띠만 있다
 */
export function attachScroll(o: ScrollOptions): Phaser.GameObjects.Container {
  const { scene, body } = o;
  const viewH = o.bottom - o.top;
  const max = Math.max(0, o.contentH - viewH);
  let offset = 0;
  const layer = scene.add.container(0, 0);
  // 띠: 입력도 막아 가려진 버튼이 눌리지 않게 한다
  const cover = scene.add.rectangle(0, o.bottom, o.width, o.height - o.bottom, o.color).setOrigin(0).setInteractive();
  layer.add(cover);
  const bar = scene.add.graphics();
  layer.add(bar);
  const apply = (next: number) => {
    offset = Math.min(max, Math.max(0, next));
    body.y = o.top - offset;
    bar.clear();
    if (max > 0) {
      const h = Math.max(48, (viewH * viewH) / o.contentH);
      const y = o.top + ((viewH - h) * offset) / max;
      bar.fillStyle(o.thumb, 0.55).fillRect(o.width - 12, y, 6, h);
    }
  };
  apply(0);
  if (max <= 0) return layer;

  let dragY: number | null = null;
  const onWheel = (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => apply(offset + dy);
  const onDown = (p: Phaser.Input.Pointer) => {
    dragY = p.y < o.bottom ? p.y : null;
  };
  const onMove = (p: Phaser.Input.Pointer) => {
    if (dragY === null || !p.isDown) return;
    apply(offset - (p.y - dragY));
    dragY = p.y;
  };
  const onUp = () => {
    dragY = null;
  };
  scene.input.on('wheel', onWheel);
  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);
  layer.once('destroy', () => {
    scene.input.off('wheel', onWheel);
    scene.input.off('pointerdown', onDown);
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('pointerupoutside', onUp);
  });
  return layer;
}
