import type { Observable } from '@datadog/browser-core'
import { generateUUID, ErrorHandling } from '@datadog/browser-core'
import type { RumErrorEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { Trace } from '../trace'
import type { CollectedRumEvent } from './events'

export function startConvertSpanToRumEvent(
  onTraceObservable: Observable<Trace>,
  onRumEventObservable: Observable<CollectedRumEvent>
) {
  onTraceObservable.subscribe((trace) => {
    trace.forEach((span) => {
      if (span.error) {
        const rumError: Partial<RumErrorEvent> = {
          type: RumEventType.ERROR,
          date: span.start / 1e6,
          error: {
            id: generateUUID(),
            message: span.meta['error.message'],
            stack: span.meta['error.stack'],
            type: span.meta['error.type'],
            source: 'source',
            handling: ErrorHandling.UNHANDLED,
          },
        }
        onRumEventObservable.notify({ event: rumError as RumErrorEvent, source: 'main-process' })
      }
    })
  })
}
