import { monitorError } from './monitor'

export interface Subscription {
  unsubscribe: () => void
}

type Observer<T> = (data: T) => void

// eslint-disable-next-line no-restricted-syntax
export class Observable<T> {
  protected observers: Array<Observer<T>> = []
  private onLastUnsubscribe?: () => void

  constructor(private onFirstSubscribe?: (observable: Observable<T>) => (() => void) | void) {}

  subscribe(observer: Observer<T>): Subscription {
    this.addObserver(observer)
    return {
      unsubscribe: () => this.removeObserver(observer),
    }
  }

  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }

  protected addObserver(observer: Observer<T>) {
    this.observers.push(observer)
    if (this.observers.length === 1 && this.onFirstSubscribe) {
      this.onLastUnsubscribe = this.onFirstSubscribe(this) || undefined
    }
  }

  protected removeObserver(observer: Observer<T>) {
    this.observers = this.observers.filter((other) => observer !== other)
    if (!this.observers.length && this.onLastUnsubscribe) {
      this.onLastUnsubscribe()
    }
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

// eslint-disable-next-line no-restricted-syntax
export class BufferedObservable<T> extends Observable<T> {
  private buffer: T[] = []

  constructor(private maxBufferSize: number) {
    // no onFirstSubscribe as it makes less sense with buffered data
    super()
  }

  notify(data: T) {
    this.buffer.push(data)
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
    }
    super.notify(data)
  }

  subscribe(observer: Observer<T>): Subscription {
    let closed = false

    const subscription = {
      unsubscribe: () => {
        closed = true
        this.removeObserver(observer)
      },
    }

    enqueueMicroTask(() => {
      for (const data of this.buffer) {
        if (closed) {
          return
        }
        observer(data)
      }

      if (!closed) {
        this.addObserver(observer)
      }
    })

    return subscription
  }

  /**
   * Drop buffered data and don't buffer future data. This is to avoid leaking memory when it's not
   * needed anymore. This is not be required in most cases, but still useful to clarify our intent
   * and lowering our memory impact.
   */
  unbuffer() {
    enqueueMicroTask(() => {
      this.maxBufferSize = this.buffer.length = 0
    })
  }
}

function enqueueMicroTask(callback: () => void) {
  Promise.resolve().then(callback).catch(monitorError)
}
