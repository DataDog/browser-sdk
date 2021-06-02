export interface Subscription {
  unsubscribe: () => void
}

export class Observable<T> {
  private observers: Array<(data: T) => void> = []

  subscribe(f: (data: T) => void): Subscription {
    this.observers.push(f)
    return {
      unsubscribe: () => {
        this.observers = this.observers.filter((other) => f !== other)
      },
    }
  }

  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }
}
