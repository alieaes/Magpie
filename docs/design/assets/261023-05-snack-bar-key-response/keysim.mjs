// 분식집 키 입력 흉내: 지금 방식(미뤄 두기 1개) vs 제안(되돌아서기 + 줄 3개 + 누르고 있기 0.15초)
// 가로 한 줄(x 0~6, 모두 통로)에서 좌우 연타. 1프레임 = 1틱(60fps).

function run(mode, step, presses) {
  // presses: [{at, hold, dir}] 틱 단위. dir -1 왼쪽, +1 오른쪽
  const s = { x: 3, from: 3, stepAt: -100, busyUntil: 0, tick: 0 };
  const moves = [];
  const busy = () => s.tick < s.busyUntil;
  function move(dir) {
    if (busy()) {
      const stepping = s.tick < s.stepAt + step && s.x !== s.from;
      if (mode === 'new' && stepping && dir === -(s.x - s.from)) {
        const e = s.tick - s.stepAt;
        const back = s.from;
        s.from = s.x;
        s.x = back;
        s.stepAt = s.tick - (step - e);
        s.busyUntil = s.tick + e;
        moves.push({ t: s.tick, dir, rev: true });
        return true;
      }
      return false;
    }
    const to = s.x + dir;
    if (to < 0 || to > 6) return true;
    s.from = s.x;
    s.x = to;
    s.stepAt = s.tick;
    s.busyUntil = s.tick + step;
    moves.push({ t: s.tick, dir });
    return true;
  }
  const down = new Map();
  let held = null;
  let pending = null;
  let pendingAt = 0;
  const queue = [];
  const end = Math.max(...presses.map((p) => p.at + p.hold)) + 120;
  for (s.tick = 0; s.tick < end; ) {
    // 키 이벤트 (프레임 시작)
    for (const p of presses) {
      if (p.at === s.tick) {
        down.set(p.dir, s.tick);
        held = p.dir;
        const fn = () => move(p.dir);
        if (mode === 'old') {
          if (!fn()) {
            pending = fn;
            pendingAt = s.tick;
          }
        } else if (queue.length > 0 || !fn()) {
          if (queue.length < 3) queue.push({ fn, at: s.tick });
        }
      }
      if (p.at + p.hold === s.tick) {
        down.delete(p.dir);
        if (held === p.dir) held = null;
      }
    }
    // 틱 진행
    s.tick += 1;
    // view.update
    if (mode === 'old') {
      if (busy()) continue;
      if (pending) {
        const fn = pending;
        pending = null;
        if (s.tick - pendingAt <= 18 && fn()) continue;
      }
      if (held !== null && down.has(held)) move(held);
    } else {
      while (queue.length > 0 && s.tick - queue[0].at > 30) queue.shift();
      if (queue.length > 0) {
        if (queue[0].fn()) queue.shift();
        continue;
      }
      if (busy()) continue;
      if (held !== null && down.has(held) && s.tick - down.get(held) >= 9) move(held);
    }
  }
  return { x: s.x, moves };
}

function alternating(n, interval, hold) {
  return Array.from({ length: n }, (_, i) => ({ at: 10 + i * interval, hold, dir: i % 2 === 0 ? -1 : 1 }));
}

const ms = (t) => Math.round((t * 1000) / 60);
for (const step of [9, 5]) {
  for (const [interval, hold] of [
    [8, 5],
    [7, 4],
    [6, 4],
    [10, 10],
  ]) {
    const presses = alternating(12, interval, hold);
    const line = [`걸음 ${step}틱(${ms(step)}ms), 좌우 12번 ${ms(interval)}ms 간격 · ${ms(hold)}ms 누름`];
    for (const mode of ['old', 'new']) {
      const r = run(mode, step, presses);
      const lags = presses.map((p) => {
        const m = r.moves.find((mv) => mv.t >= p.at && mv.dir === p.dir);
        return m ? m.t - p.at : null;
      });
      const got = lags.filter((l) => l !== null);
      const avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : 0;
      line.push(
        `  ${mode === 'old' ? '지금' : '제안'}: 걸음 ${r.moves.length}번(되돌아서기 ${r.moves.filter((m) => m.rev).length}), 끝 x=${r.x} (기대 3), 평균 반응 ${ms(avg)}ms, 최대 ${ms(Math.max(...got))}ms`,
      );
    }
    console.log(line.join('\n'));
  }
}
// 짧게 한 번 누르기 (한 칸 기대)
for (const step of [9, 5]) {
  for (const hold of [6, 9, 11]) {
    const presses = [{ at: 10, hold, dir: 1 }];
    const o = run('old', step, presses);
    const n = run('new', step, presses);
    console.log(`걸음 ${step}틱, 오른쪽 한 번 ${ms(hold)}ms 누름: 지금 ${o.x - 3}칸, 제안 ${n.x - 3}칸`);
  }
}
