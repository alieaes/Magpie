// 진동 켜기·끄기. 값은 공통 함수(@magpie/shared/haptics)가 들고 저장하고, 여기서는 Vue 값으로 이어 붙인다.
// 게임 안 설정에서 바꿔도 같은 값이 바뀐다. 근거: docs/design/261023-01-haptics.md §4

import { onBeforeUnmount, ref } from 'vue';
import { haptic, hapticSupport, hapticsEnabled, onHapticsChange, setHapticsEnabled } from '@magpie/shared/haptics';

/** 진동 상태와 바꾸는 함수. supported가 거짓이면(PC 등) 진동 버튼을 보이지 않는다 */
export function useHaptics() {
  const supported = hapticSupport() !== 'none';
  const enabled = ref(hapticsEnabled());
  const off = onHapticsChange((on) => (enabled.value = on));
  onBeforeUnmount(off);

  /** 진동 켜기/끄기 버튼. 켜면 한 번 울려 켜진 것을 손으로 알려 준다 */
  function toggle(): void {
    const next = !enabled.value;
    setHapticsEnabled(next);
    if (next) haptic('tap');
  }

  return { supported, enabled, toggle };
}
