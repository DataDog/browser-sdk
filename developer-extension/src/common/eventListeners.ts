export class EventListeners<Event = void> {
  private listeners = new Set<(event: Event) => void>()

  subscribe(listener: (event: Event) => void) {
    this.listeners.add(listener)
    return {
      unsubscribe: () => {
        this.listeners.delete(listener)
      },
    }
  }

  notify(event: Event) {
    this.listeners.forEach((listener) => listener(event))
  }
}
