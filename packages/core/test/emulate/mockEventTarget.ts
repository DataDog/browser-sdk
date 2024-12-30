export class MockEventTarget {
  public listeners: { [k: string]: EventListener[] } = {}

  addEventListener(type: string, listener: EventListener, _options?: boolean | AddEventListenerOptions): void {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }

    this.listeners[type].push(listener)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (!this.listeners[type]) {
      throw new Error(`Can't remove a listener. Event "${type}" doesn't exits.`)
    }

    this.listeners[type] = this.listeners[type].filter((lst) => listener !== lst)
  }

  dispatchEvent(event: Event): boolean {
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach((listener) => {
        listener.apply(this, [event])
      })
    }
    return true
  }
}
