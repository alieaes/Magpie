// 격자 → Phaser 캔버스 텍스처 굽기. 도트 한 칸을 dot × dot px 네모로 칠한다(확대해도 뭉개지지 않게 화면은 smoothPixelArt)
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §1

import type Phaser from 'phaser';
import type { Art } from './catalog';
import { toPixels } from './grid';

/** 그림 하나를 텍스처로 굽는다. 이미 있는 키면 굽지 않는다. 키를 돌려준다 */
export function bakeArt(scene: Phaser.Scene, art: Art): string {
  if (scene.textures.exists(art.key)) return art.key;
  const px = toPixels(art.grid, art.outline);
  const tex = scene.textures.createCanvas(art.key, px.w * art.dot, px.h * art.dot);
  if (!tex) return art.key;
  const ctx = tex.getContext();
  const d = px.data;
  for (let y = 0; y < px.h; y += 1) {
    // 한 줄에서 같은 색이 이어지면 네모 하나로 칠한다
    let x = 0;
    while (x < px.w) {
      const i = (y * px.w + x) * 4;
      if (!d[i + 3]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < px.w && sameColor(d, i, i + run * 4)) run += 1;
      ctx.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
      ctx.fillRect(x * art.dot, y * art.dot, run * art.dot, art.dot);
      x += run;
    }
  }
  tex.refresh();
  return art.key;
}

/** 두 칸이 같은 불투명 색인지 */
function sameColor(d: Uint8ClampedArray, a: number, b: number): boolean {
  return d[b + 3]! > 0 && d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2];
}
