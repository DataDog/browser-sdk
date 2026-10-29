import { monitorError, startMonitorErrorCollection, stopMonitorErrorCollection } from '@datadog/js-core/monitor'
import type { Subscription } from '@datadog/js-core/util'
import { trackRuntimeError, getTelemetryObservable, BufferedDataType, addTelemetryDebug } from '@datadog/browser-core'
import type { BufferedData, BufferedDataSource } from '@datadog/browser-core'
import { BufferedObservable, globalObject, mockable } from '@datadog/js-core/util'

interface RumBuffer extends BufferedDataSource {
  connect: NonNullable<BufferedDataSource['connect']>
}

const bufferGlobal = globalObject as typeof globalObject & { __DD_RUM_BUFFER__?: RumBuffer }

/** Starts the synchronous script once, reusing an existing buffer. */
export function startRumBuffer() {
  getOrCreateRumBuffer()
}

/** Reuses the early script's collector, or starts the same collector at SDK evaluation time. */
export function getOrCreateRumBuffer(): RumBuffer {
  return (bufferGlobal.__DD_RUM_BUFFER__ ??= createDataBuffer())
}

/** Starts an independent buffer without reading or replacing the early RUM handle. */
export function createDataBuffer(): RumBuffer {
  let stopped = false
  const observable = new BufferedObservable<BufferedData>(500, (count) => {
    if (!stopped) {
      // monitor-until: 2026-12-01
      addTelemetryDebug('Early data collection dropped data on unbuffer', { count })
    }
  })
  const types: BufferedDataType[] = []
  const subscriptions: Subscription[] = []

  const subscribe: BufferedDataSource['subscribe'] = (type, createSource) => {
    if (stopped || types.includes(type)) {
      return
    }
    subscriptions.push(createSource().subscribe((data) => observable.notify({ type, data } as BufferedData)))
    types.push(type)
  }

  subscribe(BufferedDataType.RUNTIME_ERROR, () => mockable(trackRuntimeError)())
  let connected = false
  let ownsMonitor = false

  return {
    types,
    subscribe,
    observable,
    connect: (telemetry, onMonitorError) => {
      if (connected || stopped) {
        return
      }
      connected = true
      const earlyTelemetry = getTelemetryObservable()
      // Module-based capture already shares the SDK's sinks. Connecting it to itself would loop.
      if (earlyTelemetry !== telemetry) {
        subscriptions.push(earlyTelemetry.subscribe((event) => telemetry.notify(event)))
        earlyTelemetry.unbuffer()
      }
      if (onMonitorError !== monitorError) {
        ownsMonitor = startMonitorErrorCollection(onMonitorError)
      }
    },
    stop: () => {
      if (!stopped) {
        stopped = true
        subscriptions.forEach((subscription) => subscription.unsubscribe())
        if (ownsMonitor) {
          stopMonitorErrorCollection()
        }
        observable.unbuffer()
      }
    },
  }
}
