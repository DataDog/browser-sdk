export interface Subscription {
  unsubscribe: () => void
}

export class Observable<T> {
  private observers: Array<(data: T) => void> = []
  private onLastUnsubscribe?: () => void

  constructor(private onFirstSubscribe?: () => (() => void) | void) {}

  subscribe(f: (data: T) => void): Subscription {
    if (!this.observers.length && this.onFirstSubscribe) {
      this.onLastUnsubscribe = this.onFirstSubscribe() || undefined
    }
    this.observers.push(f)
    return {
      unsubscribe: () => {
        this.observers = this.observers.filter((other) => f !== other)
        if (!this.observers.length && this.onLastUnsubscribe) {
          this.onLastUnsubscribe()
        }
      },
    }
  }

  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }

  hasSubscribers() {
    return this.observers.length > 0
  }
}

export function mergeObservables<T>(...observables: Array<Observable<T>>) {
  const globalObservable = new Observable<T>(() => {
    const subscriptions: Subscription[] = observables.map((observable) =>
      observable.subscribe((data) => globalObservable.notify(data))
    )
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  })

  return globalObservable
}
