import { queueMicrotask } from './queueMicrotask'

/**
 * Handle returned by {@link Observable.subscribe}, used to stop receiving notifications.
 */
export interface Subscription {
  /** Removes the observer from the observable. Calling it more than once has no effect. */
  unsubscribe: () => void
}

type Observer<T> = (data: T) => void

/**
 * Minimal synchronous publish/subscribe primitive.
 *
 * Observers are called synchronously, in subscription order, each time {@link Observable.notify}
 * is invoked. An optional `onFirstSubscribe` callback lets the observable lazily set up its
 * underlying source (e.g. a DOM listener) when the first observer subscribes; the function it
 * returns, if any, is called to tear that source down when the last observer unsubscribes.
 *
 * @example
 * ```ts
 * const resize = new Observable<UIEvent>((observable) => {
 *   const { stop } = addEventListener(window, DOM_EVENT.RESIZE, (event) => observable.notify(event))
 *   return stop
 * })
 * const subscription = resize.subscribe((event) => console.log(event))
 * subscription.unsubscribe() // last observer: the listener is removed
 * ```
 */
// eslint-disable-next-line no-restricted-syntax
export class Observable<T> {
  /** Observers currently subscribed, in subscription order. */
  protected observers: Array<Observer<T>> = []
  private onLastUnsubscribe?: () => void

  /**
   * Creates an observable with no observers.
   *
   * @param onFirstSubscribe - Called when the observer count goes from 0 to 1. May return a
   * teardown function, called when the observer count goes back to 0.
   */
  constructor(private onFirstSubscribe?: (observable: Observable<T>) => (() => void) | void) {}

  /**
   * Registers `observer` to be called on every subsequent {@link Observable.notify}.
   *
   * @param observer - Function called with each notified value.
   * @returns A {@link Subscription} to stop receiving notifications.
   */
  subscribe(observer: Observer<T>): Subscription {
    this.addObserver(observer)
    return {
      unsubscribe: () => this.removeObserver(observer),
    }
  }

  /**
   * Synchronously calls every subscribed observer with `data`.
   *
   * @param data - Value passed to each observer.
   */
  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }

  /**
   * Adds `observer` to the observer list, triggering `onFirstSubscribe` if it is the first one.
   *
   * @param observer - The observer to add.
   */
  protected addObserver(observer: Observer<T>) {
    this.observers.push(observer)
    if (this.observers.length === 1 && this.onFirstSubscribe) {
      this.onLastUnsubscribe = this.onFirstSubscribe(this) || undefined
    }
  }

  /**
   * Removes `observer` from the observer list, calling the teardown returned by
   * `onFirstSubscribe` if it was the last one.
   *
   * @param observer - The observer to remove.
   */
  protected removeObserver(observer: Observer<T>) {
    this.observers = this.observers.filter((other) => observer !== other)
    if (!this.observers.length && this.onLastUnsubscribe) {
      this.onLastUnsubscribe()
    }
  }
}

/**
 * Creates an {@link Observable} that forwards every value notified by any of `observables`.
 *
 * Source observables are subscribed lazily, when the merged observable gets its first observer,
 * and unsubscribed when its last observer unsubscribes.
 *
 * @param observables - The observables to merge.
 * @returns An observable notifying the values of all `observables`.
 */
export function mergeObservables<T>(...observables: Array<Observable<T>>) {
  return new Observable<T>((globalObservable) => {
    const subscriptions: Subscription[] = observables.map((observable) =>
      observable.subscribe((data) => globalObservable.notify(data))
    )
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  })
}

/**
 * An {@link Observable} that keeps a bounded history of notified values and replays it to each new
 * observer.
 *
 * This lets late subscribers (e.g. a component started after SDK initialization) receive values
 * notified before they subscribed. Once every interested party has subscribed, call
 * {@link BufferedObservable.unbuffer} to release the buffer.
 */
// eslint-disable-next-line no-restricted-syntax
export class BufferedObservable<T> extends Observable<T> {
  private buffer: T[] = []
  private droppedCount = 0

  /**
   * Creates a buffered observable with an empty buffer.
   *
   * @param maxBufferSize - Maximum number of values kept in the buffer. When exceeded, the oldest
   * value is dropped.
   * @param onDrop - Called on {@link BufferedObservable.unbuffer} with the number of values that
   * were dropped because the buffer was full, if any.
   */
  constructor(
    private maxBufferSize: number,
    private onDrop?: (count: number) => void
  ) {
    super()
  }

  /**
   * Buffers `data` (dropping the oldest value if the buffer is full), then notifies current
   * observers synchronously.
   *
   * @param data - Value passed to each observer.
   */
  notify(data: T) {
    this.buffer.push(data)
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
      this.droppedCount++
    }
    super.notify(data)
  }

  /**
   * Registers `observer`. Buffered values are replayed to it in a microtask, after which it
   * receives new values as they are notified. Unsubscribing during the replay stops it.
   *
   * @param observer - Function called with each buffered and subsequently notified value.
   * @returns A {@link Subscription} to stop receiving notifications.
   */
  subscribe(observer: Observer<T>): Subscription {
    let closed = false

    const subscription = {
      unsubscribe: () => {
        closed = true
        this.removeObserver(observer)
      },
    }

    queueMicrotask(() => {
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
   * needed anymore. This can be seen as a performance optimization, and things will work probably
   * even if this method isn't called, but still useful to clarify our intent and lowering our
   * memory impact.
   */
  unbuffer() {
    queueMicrotask(() => {
      if (this.droppedCount > 0 && this.onDrop) {
        this.onDrop(this.droppedCount)
      }
      this.maxBufferSize = this.buffer.length = 0
    })
  }
}
