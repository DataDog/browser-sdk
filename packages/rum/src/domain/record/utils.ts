import { FrustrationType } from 'packages/rum-core/src/rawRumEvent.types'

export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches)
}

export function forEach<List extends { [index: number]: any }>(
  list: List,
  callback: (value: List[number], index: number, parent: List) => void
) {
  Array.prototype.forEach.call(list, callback as any)
}

export function getFrustrationFromAction(frustrations: FrustrationType[]): FrustrationType {
  return frustrations.some((f) => f === FrustrationType.RAGE_CLICK)
    ? FrustrationType.RAGE_CLICK
    : frustrations.some((f) => f === FrustrationType.ERROR_CLICK)
      ? FrustrationType.ERROR_CLICK
      : FrustrationType.DEAD_CLICK
}
