// 분식집 키 입력 흉내 2: 줄 크기별 씹힘과 "손 뗀 뒤 더 움직임" 비교
// 넓은 바닥(모두 통로), 1프레임 = 1틱(60fps). 걸음 step틱, 행동 6틱.
// 방식: old = 지금(미뤄 두기 1개, 덮어씀, 0.3초, 누르고 있으면 바로 이어 걷기)
//       q1/q2/q3/qInf = 되돌아서기 + 줄 N개(덮어쓰지 않음, 가득하면 새것 버림) + 누르고 있기 0.15초부터

const DIRS = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };

function run(mode, step, presses) {
  const s = { x: 0, y: 0, fx: 0, fy: 0, dir: null, stepAt: -100, busyUntil: 0, tick: 0 };
  const done = [];
  const busy = () => s.tick < s.busyUntil;
  const stepping = () => s.tick < s.stepAt + step && (s.x !== s.fx || s.y !== s.fy);
  function act(key) {
    if (key === 'S') {
      if (busy()) return false;
      s.busyUntil = s.tick + 6;
      done.push({ t: s.tick, key });
      return true;
    }
    if (busy()) {
      if (mode !== 'old' && stepping() && key === OPP[s.dir]) {
        const e = s.tick - s.stepAt;
        [s.x, s.y, s.fx, s.fy] = [s.fx, s.fy, s.x, s.y];
        s.dir = key;
        s.stepAt = s.tick - (step - e);
        s.busyUntil = s.tick + e;
        done.push({ t: s.tick, key, rev: true });
        return true;
      }
      return false;
    }
    const [dx, dy] = DIRS[key];
    [s.fx, s.fy] = [s.x, s.y];
    s.x += dx;
    s.y += dy;
    s.dir = key;
    s.stepAt = s.tick;
    s.busyUntil = s.tick + step;
    done.push({ t: s.tick, key });
    return true;
  }
  const cap = { q1: 1, q2: 2, q3: 3, qInf: Infinity }[mode];
  const down = new Map();
  let held = null;
  let pending = null;
  let pendingAt = 0;
  const queue = [];
  let dropped = 0;
  const end = Math.max(...presses.map((p) => p.at + p.hold)) + 180;
  for (s.tick = 0; s.tick < end; ) {
    for (const p of presses) {
      if (p.at === s.tick) {
        if (p.key !== 'S') {
          down.set(p.key, s.tick);
          held = p.key;
        }
        const fn = () => act(p.key);
        if (mode === 'old') {
          if (!fn()) {
            if (pending) dropped += 1;
            pending = fn;
            pendingAt = s.tick;
          }
        } else if (queue.length > 0 || !fn()) {
          if (queue.length < cap) queue.push(fn);
          else dropped += 1;
        }
      }
      if (p.key !== 'S' && p.at + p.hold === s.tick) {
        down.delete(p.key);
        if (held === p.key) held = null;
      }
    }
    s.tick += 1;
    if (mode === 'old') {
      if (busy()) continue;
      if (pending) {
        const fn = pending;
        pending = null;
        if (s.tick - pendingAt <= 18) {
          if (fn()) continue;
        } else dropped += 1;
      }
      if (held !== null && down.has(held)) act(held);
    } else {
      if (queue.length > 0) {
        if (queue[0]()) queue.shift();
        continue;
      }
      if (busy()) continue;
      if (held !== null && down.has(held) && s.tick - down.get(held) >= 9) act(held);
    }
  }
  const lastPress = Math.max(...presses.map((p) => p.at));
  const lastDone = done.length ? done[done.length - 1].t : 0;
  // 기대 자리: 누른 방향을 모두 한 칸씩
  let ex = 0;
  let ey = 0;
  for (const p of presses) if (p.key !== 'S') [ex, ey] = [ex + DIRS[p.key][0], ey + DIRS[p.key][1]];
  return { dropped, extra: done.length - (presses.length - dropped), off: Math.abs(s.x - ex) + Math.abs(s.y - ey), after: Math.max(0, lastDone - lastPress) };
}

const seq = (keys, interval, hold = 4) => keys.split('').map((key, i) => ({ at: 10 + i * interval, hold, key }));
const ms = (t) => `${Math.round((t * 1000) / 60)}ms`;
const scenarios = [
  ['좌우 12번 0.1초 간격', seq('LRLRLRLRLRLR', 6)],
  ['같은 방향 6번 0.1초 간격', seq('LLLLLL', 6)],
  ['같은 방향 10번 0.08초 간격', seq('LLLLLLLLLL', 5)],
  ['계단(왼·위) 8번 0.1초 간격', seq('LULULULU', 6)],
  ['걷다가 행동: 왼 왼 스페이스 0.07초 간격', seq('LLS', 4)],
  ['스페이스 연타 8번 0.07초 간격', seq('SSSSSSSS', 4)],
];
for (const step of [9, 5]) {
  console.log(`\n== 걸음 ${ms(step)}`);
  for (const [name, presses] of scenarios) {
    const cells = ['old', 'q1', 'q2', 'q3', 'qInf'].map((m) => {
      const r = run(m, step, presses);
      return `${m}: 씹힘 ${r.dropped} 어긋남 ${r.off} 뗀 뒤 ${ms(r.after)}`;
    });
    console.log(`${name}\n  ${cells.join('\n  ')}`);
  }
}
