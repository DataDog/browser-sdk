import type { Telemetry, RawTelemetryEvent } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { registerCleanupTask, startMockTelemetry } from '@datadog/browser-core/test'
import type { RecorderInitEvent } from '../boot/postStartStrategy'
import { type RecorderInitMetrics, startRecorderInitTelemetry } from './startRecorderInitTelemetry'

describe('startRecorderInitTelemetry', () => {
  let observable: Observable<RecorderInitEvent>
  let telemetry: MockTelemetry

  function startRecorderInitTelemetryCollection(metricsEnabled: boolean = true) {
    observable = new Observable<RecorderInitEvent>()
    telemetry = startMockTelemetry()
    const { stop: stopRecorderInitTelemetry } = startRecorderInitTelemetry({ metricsEnabled } as Telemetry, observable)
    registerCleanupTask(stopRecorderInitTelemetry)
  }

  it('should collect recorder init metrics telemetry', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.getEvents()).toEqual([expectedRecorderInitTelemetry()])
  })

  it('should not collect recorder init metrics telemetry twice', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.getEvents()).toEqual([expectedRecorderInitTelemetry()])

    telemetry.reset()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.hasEvents()).toEqual(false)
  })

  it('should not collect recorder init metrics telemetry unless start time is known', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.hasEvents()).toEqual(false)
  })

  it('should collect recorder init metrics telemetry even without document-ready', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.getEvents()).toEqual([
      expectedRecorderInitTelemetry({
        waitForDocReadyDuration: undefined,
      }),
    ])
  })

  it('should collect recorder init metrics telemetry even without recorder-settled', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.getEvents()).toEqual([
      expectedRecorderInitTelemetry({
        loadRecorderModuleDuration: undefined,
      }),
    ])
  })

  it('should report if recording is aborted', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'aborted' })
    expect(await telemetry.getEvents()).toEqual([
      expectedRecorderInitTelemetry({
        result: 'aborted',
      }),
    ])
  })

  it('should report if the deflate encoder fails to load', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'deflate-encoder-load-failed' })
    expect(await telemetry.getEvents()).toEqual([
      expectedRecorderInitTelemetry({
        result: 'deflate-encoder-load-failed',
      }),
    ])
  })

  it('should report if the recorder module fails to load', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'recorder-load-failed' })
    expect(await telemetry.getEvents()).toEqual([
      expectedRecorderInitTelemetry({
        result: 'recorder-load-failed',
      }),
    ])
  })

  it('should report if the recording was force-enabled', async () => {
    startRecorderInitTelemetryCollection()
    observable.notify({ type: 'start', forced: true })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.getEvents()).toEqual([
      expectedRecorderInitTelemetry({
        forced: true,
      }),
    ])
  })

  it('should not collect recorder init metrics telemetry when telemetry is disabled', async () => {
    startRecorderInitTelemetryCollection(false)
    observable.notify({ type: 'start', forced: false })
    observable.notify({ type: 'recorder-settled' })
    observable.notify({ type: 'document-ready' })
    observable.notify({ type: 'succeeded' })
    expect(await telemetry.hasEvents()).toBe(false)
  })
})

function expectedRecorderInitTelemetry(overrides: Partial<RecorderInitMetrics> = {}): RawTelemetryEvent {
  return {
    type: 'log',
    status: 'debug',
    message: 'Recorder init metrics',
    metrics: {
      forced: false,
      loadRecorderModuleDuration: jasmine.any(Number),
      recorderInitDuration: jasmine.any(Number),
      result: 'succeeded',
      waitForDocReadyDuration: jasmine.any(Number),
      ...overrides,
    },
  }
}
