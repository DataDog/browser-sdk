export interface Subscription {
  unsubscribe: () => void
}

export class Observable<T> {
  private observers: Array<(data: T) => void> = []
  private onLastUnsubscribe?: () => void

  constructor(private onFirstSubscribe?: (observable: Observable<T>) => (() => void) | void) {}

  subscribe(f: (data: T) => void): Subscription {
    if (!this.observers.length && this.onFirstSubscribe) {
      this.onLastUnsubscribe = this.onFirstSubscribe(this) || undefined
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
}

export function mergeObservables<T>(...observables: Array<Observable<T>>) {
  return new Observable<T>((globalObservable) => {
    const subscriptions: Subscription[] = observables.map((observable) =>
      observable.subscribe((data) => globalObservable.notify(data))
    )
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  })
}
