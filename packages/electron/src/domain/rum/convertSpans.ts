import type { Observable } from '@datadog/browser-core'
import { ResourceType, generateUUID } from '@datadog/browser-core'
import type { RumResourceEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { Trace } from '../trace/trace'
import { createIdentifier } from '../trace/id'
import type { CollectedRumEvent } from './events'

export function startConvertSpanToRumEvent(
  onTraceObservable: Observable<Trace>,
  onRumEventObservable: Observable<CollectedRumEvent>
) {
  onTraceObservable.subscribe((trace) => {
    trace.forEach((span) => {
      if (span.name === 'http.request') {
        const rumResource: Partial<RumResourceEvent> = {
          type: RumEventType.RESOURCE,
          date: span.start / 1e6,
          resource: {
            id: generateUUID(),
            duration: span.duration,
            type: ResourceType.NATIVE,
            method: span.meta['http.method'],
            status_code: span.meta['http.status'],
            url: span.meta['http.url'],
          },
          _dd: {
            trace_id: createIdentifier(span.trace_id, 16).toString(10),
            span_id: createIdentifier(span.span_id, 16).toString(10),
            format_version: 2,
          },
        }
        onRumEventObservable.notify({ event: rumResource as RumResourceEvent, source: 'main-process' })
      }
    })
  })
}
