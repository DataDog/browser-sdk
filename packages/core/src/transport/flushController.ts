import type { PageExitEvent } from '../browser/pageExitObservable'
import { Observable } from '../tools/observable'
import { setTimeout } from '../tools/timer'

export type FlushReason =
  | 'batch_duration_limit'
  | 'batch_bytes_limit'
  | 'before_unload'
  | 'page_hide'
  | 'visibility_hidden'
  | 'page_frozen'

export type FlushController = ReturnType<typeof createFlushController>

interface FlushControllerOptions {
  batchMessagesLimit: number
  batchBytesLimit: number
  flushTimeout: number
  pageExitObservable: Observable<PageExitEvent>
}

export function createFlushController({
  batchMessagesLimit,
  batchBytesLimit,
  flushTimeout,
  pageExitObservable,
}: FlushControllerOptions) {
  const flushObservable = new Observable<FlushReason>()

  flushPeriodically(flushObservable, flushTimeout)

  pageExitObservable.subscribe((event) => flushObservable.notify(event.reason))

  return {
    flushIfFull(messagesCount: number, bytesCount: number) {
      if (messagesCount === batchMessagesLimit || bytesCount >= batchBytesLimit) {
        flushObservable.notify('batch_bytes_limit')
      }
    },

    flushObservable,
  }
}

function flushPeriodically(flushObservable: Observable<FlushReason>, flushTimeout: number) {
  setTimeout(() => {
    flushObservable.notify('batch_duration_limit')
    flushPeriodically(flushObservable, flushTimeout)
  }, flushTimeout)
}
