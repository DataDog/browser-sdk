export class EventEmitter<TEvents extends object> {
  private listeners = new Map<keyof TEvents, Set<(data: any) => void>>()

  on<K extends keyof TEvents>(event: K, listener: (data: TEvents[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off<K extends keyof TEvents>(event: K, listener: (data: TEvents[K]) => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(data))
  }
}
