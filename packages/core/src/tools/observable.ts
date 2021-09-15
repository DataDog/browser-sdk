import { noop } from './utils'

export interface Subscription {
  unsubscribe: () => void
}

export interface ObservableParams {
  onFirstSubscribe?: () => void
  onLastUnsubscribe?: () => void
}

export class Observable<T> {
  private observers: Array<(data: T) => void> = []
  private onFirstSubscribe: () => void
  private onLastUnsubscribe: () => void

  constructor(params?: ObservableParams) {
    this.onFirstSubscribe = params?.onFirstSubscribe || noop
    this.onLastUnsubscribe = params?.onLastUnsubscribe || noop
  }

  subscribe(f: (data: T) => void): Subscription {
    if (!this.observers.length) {
      this.onFirstSubscribe()
    }
    this.observers.push(f)
    return {
      unsubscribe: () => {
        this.observers = this.observers.filter((other) => f !== other)
        if (!this.observers.length) {
          this.onLastUnsubscribe()
        }
      },
    }
  }

  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }
}
