// 성장형 게임에 넘기는 서버 창구(GrowthSession). 게임은 서버 주소를 모르고 이것으로만 저장한다.
//   saved: 로그인 + 닉네임. 서버에 저장한다.
//   trial: 체험. 시작 상태로 하루만 해 볼 수 있고 아무것도 저장하지 않는다.
// 근거: docs/design/261021-04-game-save.md §3, §6-2

import { randomSeed, type FinishPlayRequest, type GameId } from '@magpie/shared';
import type { GrowthSession } from '@magpie/shared/game-module';
import { ApiError, adoptTrialDay, fetchSave, finishPlay, sendSaveAction, startPlay } from '../api';

const PENDING_PREFIX = 'magpie.pendingDay.';
const TRIAL_PREFIX = 'magpie.trialDay.';

/** 보내지 못한 하루. 다음에 가게를 열 때 판이 아직 열려 있으면 다시 보낸다 */
interface PendingDay {
  playId: number;
  body: FinishPlayRequest;
}

/** 보내지 못한 하루를 읽는다. 없거나 모양이 틀리면 null */
function readPending(gameId: GameId): PendingDay | null {
  try {
    const text = localStorage.getItem(PENDING_PREFIX + gameId);
    if (!text) return null;
    const value = JSON.parse(text) as Partial<PendingDay>;
    if (typeof value.playId !== 'number' || !value.body || !Array.isArray(value.body.inputs)) return null;
    return value as PendingDay;
  } catch {
    return null;
  }
}

/** 보내지 못한 하루를 적거나(null이면) 지운다. 저장소를 못 쓰면 무시한다 */
function writePending(gameId: GameId, pending: PendingDay | null): void {
  try {
    if (pending) localStorage.setItem(PENDING_PREFIX + gameId, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_PREFIX + gameId);
  } catch {
    // 저장 실패는 무시한다. 다시 보내기는 화면이 열려 있는 동안만 된다
  }
}

/** 체험으로 한 하루. 로그인하면 이 계정의 첫 하루로 이어받는다 */
interface TrialDay extends FinishPlayRequest {
  seed: string;
}

/** 체험한 하루를 읽는다. 없거나 모양이 틀리면 null */
function readTrialDay(gameId: GameId): TrialDay | null {
  try {
    const text = localStorage.getItem(TRIAL_PREFIX + gameId);
    if (!text) return null;
    const value = JSON.parse(text) as Partial<TrialDay>;
    if (typeof value.seed !== 'string' || typeof value.ticks !== 'number' || typeof value.score !== 'number' || !Array.isArray(value.inputs)) return null;
    return value as TrialDay;
  } catch {
    return null;
  }
}

/** 체험한 하루를 적거나(null이면) 지운다. 로그인은 페이지를 새로 띄우므로 메모리가 아니라 저장소에 둔다 */
function writeTrialDay(gameId: GameId, day: TrialDay | null): void {
  try {
    if (day) localStorage.setItem(TRIAL_PREFIX + gameId, JSON.stringify(day));
    else localStorage.removeItem(TRIAL_PREFIX + gameId);
  } catch {
    // 저장소를 못 쓰면 체험 이어받기만 안 된다
  }
}

/** 서버가 판정을 내린 오류인지(다시 보내도 같다). 연결 실패·서버 오류는 다시 보낼 만하다 */
function isSettled(err: unknown): boolean {
  return err instanceof ApiError && err.status < 500;
}

/** 로그인 유저의 창구를 만든다. 저장 버전은 창구가 기억해 가게 행동에 붙인다 */
export function createSavedSession(gameId: GameId, requestLogin: () => void): GrowthSession {
  let version = 0;
  let playId: number | null = null;

  /** 보내지 못한 하루가 있으면 먼저 보낸다. 판정이 나면(통과·거절·이미 끝남) 지운다 */
  async function flushPending(): Promise<void> {
    const pending = readPending(gameId);
    if (!pending) return;
    try {
      await finishPlay(pending.playId, pending.body);
      writePending(gameId, null);
    } catch (err) {
      if (isSettled(err)) writePending(gameId, null);
      else console.warn('[growth] 지난 하루를 다시 보내지 못했다', err);
    }
  }

  return {
    mode: 'saved',

    async load() {
      await flushPending();
      let save = await fetchSave(gameId);
      // 기록이 없는 계정이면 로그인 전에 체험한 하루를 첫 하루로 이어받는다
      const trial = readTrialDay(gameId);
      if (trial) {
        try {
          if (save.version === 1) {
            const adopted = await adoptTrialDay({ gameId, ...trial });
            if (adopted.adopted) save = adopted.save;
          }
          writeTrialDay(gameId, null);
        } catch (err) {
          // 서버가 판정한 오류면 버리고, 연결 실패·5xx면 남겨 다음에 다시 시도한다
          if (isSettled(err)) writeTrialDay(gameId, null);
          else console.warn('[growth] 체험한 하루를 이어받지 못했다', err);
        }
      }
      version = save.version;
      return save;
    },

    async startDay() {
      const play = await startPlay(gameId);
      playId = play.playId;
      if (play.saveVersion !== undefined) version = play.saveVersion;
      return { seed: play.seed };
    },

    async finishDay(result) {
      if (playId === null) throw new Error('연 하루가 없다');
      const body: FinishPlayRequest = { inputs: result.inputs, ticks: result.ticks, score: result.score };
      // 응답을 받기 전에 페이지가 닫혀도 다음에 다시 보낼 수 있게 먼저 적어 둔다
      writePending(gameId, { playId, body });
      try {
        const response = await finishPlay(playId, body);
        writePending(gameId, null);
        playId = null;
        if (response.accepted && response.save) version = response.save.version;
        return response;
      } catch (err) {
        if (isSettled(err)) writePending(gameId, null);
        throw err;
      }
    },

    async act(action) {
      const outcome = await sendSaveAction(gameId, version, action);
      if (outcome.save) version = outcome.save.version;
      return outcome;
    },

    requestLogin,
  };
}

/** 체험 창구를 만든다. 서버와 이야기하지 않는다. fixedSeed는 개발 중 ?seed=로 같은 하루를 다시 띄울 때 */
export function createTrialSession(
  gameId: GameId,
  initialState: unknown,
  requestLogin: () => void,
  fixedSeed: string | null = null,
  trialHint?: string,
): GrowthSession {
  const save = { version: 0, state: initialState };
  let seed = '';
  return {
    mode: 'trial',
    ...(trialHint ? { trialHint } : {}),
    load: async () => save,
    startDay: async () => {
      seed = fixedSeed ?? randomSeed();
      return { seed };
    },
    finishDay: async (result) => {
      // 개발용 고정 시드 체험은 이어받지 않는다
      if (!fixedSeed) writeTrialDay(gameId, { seed, inputs: result.inputs, ticks: result.ticks, score: result.score });
      return { accepted: true, score: result.score, best: { today: false, allTime: false }, rank: { today: null } };
    },
    act: async () => ({ ok: false, reason: 'trial' }),
    requestLogin,
  };
}
