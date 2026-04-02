type Handler<T = unknown> = (data: T) => void

class EventEmitter<TEvents extends object> {
  private listeners = new Map<keyof TEvents, Set<Handler<any>>>()

  on<K extends keyof TEvents>(event: K, listener: Handler<TEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off<K extends keyof TEvents>(event: K, listener: Handler<TEvents[K]>): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void
  emit<K extends keyof TEvents>(event: undefined extends TEvents[K] ? K : never): void
  emit<K extends keyof TEvents>(event: K, data?: TEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(data))
  }
}

export { EventEmitter }
