export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches)
}
