let listener: (() => void) | undefined

export function listenDisconnectEvent(newListener: () => void) {
  listener = newListener
}

export function notifyDisconnectEvent() {
  if (listener) listener()
}
