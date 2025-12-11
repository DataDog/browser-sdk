import type { Batch, Configuration, AbstractHooks, TelemetryEvent, Context } from '@datadog/browser-core'
import { startTelemetryCollection, Observable, TelemetryService } from '@datadog/browser-core'

export function startTelemetry(batch: Batch, configuration: Configuration, hooks: AbstractHooks) {
  const observable = new Observable<TelemetryEvent & Context>()

  observable.subscribe((event) => {
    batch.add(event)
  })

  startTelemetryCollection(TelemetryService.ELECTRON, configuration, hooks, observable)
}
