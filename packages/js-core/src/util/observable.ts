import { queueMicrotask } from './queueMicrotask'

/** A handle returned by {@link Observable.subscribe} that allows cancelling the subscription. */
export interface Subscription {
  unsubscribe: () => void
}

type Observer<T> = (data: T) => void

/**
 * A minimal observable / event-emitter that supports subscribing, unsubscribing, and notifying
 * observers synchronously.
 *
 * An optional `onFirstSubscribe` callback can be provided to the constructor to perform setup work
 * (e.g. attaching a DOM listener) lazily — it runs when the first observer subscribes and may
 * return a teardown function that is called when the last observer unsubscribes.
 *
 * @typeParam T - The type of value emitted to observers.
 */
// eslint-disable-next-line no-restricted-syntax
export class Observable<T> {
  protected observers: Array<Observer<T>> = []
  private onLastUnsubscribe?: () => void

  constructor(private onFirstSubscribe?: (observable: Observable<T>) => (() => void) | void) {}

  /** Adds `observer` and returns a {@link Subscription} that removes it. */
  subscribe(observer: Observer<T>): Subscription {
    this.addObserver(observer)
    return {
      unsubscribe: () => this.removeObserver(observer),
    }
  }

  /** Synchronously calls every currently subscribed observer with `data`. */
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

/**
 * Merges multiple observables into a single observable that emits whenever any source emits.
 *
 * Subscribing to the merged observable subscribes to all sources; unsubscribing from it
 * unsubscribes from all sources.
 *
 * @param observables - The source observables to merge.
 * @returns A new {@link Observable} that forwards emissions from all sources.
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
 * An {@link Observable} that buffers emitted values and replays them to late subscribers.
 *
 * When a new observer subscribes, all values buffered since the last subscriber was added are
 * delivered to it asynchronously (via {@link queueMicrotask}) before the observer is added to the
 * live set. This avoids re-entrant notifications during subscription.
 *
 * The buffer is bounded by `maxBufferSize`; when it overflows, the oldest entry is dropped and
 * `onDrop` is called with the total number of dropped items once the buffer is cleared.
 *
 * @typeParam T - The type of value buffered and emitted.
 */
// eslint-disable-next-line no-restricted-syntax
export class BufferedObservable<T> extends Observable<T> {
  private buffer: T[] = []
  private droppedCount = 0

  /**
   * Creates a new `BufferedObservable`.
   *
   * @param maxBufferSize - Maximum number of values to keep in the buffer.
   * @param onDrop - Optional callback invoked with the total drop count when the buffer is cleared.
   */
  constructor(
    private maxBufferSize: number,
    private onDrop?: (count: number) => void
  ) {
    super()
  }

  notify(data: T) {
    this.buffer.push(data)
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
      this.droppedCount++
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
   * Drops all buffered data and disables future buffering.
   *
   * Call this when the buffer is no longer needed to free memory and clarify intent.
   * If items were dropped, `onDrop` is called once asynchronously (via a microtask).
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
