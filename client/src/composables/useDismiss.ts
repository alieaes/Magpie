import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * 열린 팝업(메뉴)을 바깥을 누르거나 Esc를 누르면 닫는다.
 * isInside가 true인 곳(메뉴와 그 메뉴를 여는 버튼)을 누르면 그대로 둔다.
 */
export function useDismiss(open: Ref<boolean>, isInside: (target: Node) => boolean): void {
  /** 바깥을 누르면 닫는다 */
  function onPointerDown(e: PointerEvent): void {
    if (!isInside(e.target as Node)) open.value = false;
  }

  /** Esc를 누르면 닫는다 */
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') open.value = false;
  }

  /** 문서 이벤트를 뗀다 */
  function detach(): void {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeydown);
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('keydown', onKeydown);
    } else {
      detach();
    }
  });
  onBeforeUnmount(detach);
}
