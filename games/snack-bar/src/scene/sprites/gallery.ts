// 개발용 그림 보기(?sprites): 모든 도트 그림을 이름표와 함께 늘어놓는다. 휠·끌기로 위아래로 넘긴다
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §4(개발용 그림 보기)

import type Phaser from 'phaser';
import { bakeArt } from './bake';
import { galleryLayout } from './catalog';

/** 이름표 글꼴 */
const FONT = '"Galmuri11", "Pretendard Variable", Pretendard, sans-serif';

/** 그림 보기 화면을 그린다 */
export function drawGallery(scene: Phaser.Scene): void {
  const view = scene.scale.width;
  const layout = galleryLayout(view);
  const cam = scene.cameras.main;
  cam.setBackgroundColor('#fdf9ee');
  for (const t of layout.titles) {
    scene.add.text(t.x, t.y, t.text, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#5a3c3c' });
  }
  for (const it of layout.items) {
    scene.add.image(it.x, it.y, bakeArt(scene, it.art)).setOrigin(0);
    for (const o of it.over ?? []) scene.add.image(o.x, o.y, bakeArt(scene, o.art)).setOrigin(0);
    const h = scene.textures.get(it.art.key).getSourceImage().height;
    scene.add.text(it.x, it.y + h + 2, it.label, { fontFamily: FONT, fontSize: '12px', color: '#6e5050' });
  }
  // 위아래 넘기기: 휠, 끌기
  cam.setBounds(0, 0, Math.max(view, layout.width), Math.max(scene.scale.height, layout.height));
  scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
    cam.scrollX += dx;
    cam.scrollY += dy;
  });
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (!p.isDown) return;
    cam.scrollX -= p.position.x - p.prevPosition.x;
    cam.scrollY -= p.position.y - p.prevPosition.y;
  });
}
