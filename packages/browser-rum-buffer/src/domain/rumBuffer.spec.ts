import { monitorError } from '@datadog/js-core/monitor'
import { trackRuntimeError, ErrorSource, BufferedDataType } from '@datadog/browser-core'
import type { RawError, BufferedData } from '@datadog/browser-core'
import { Observable, globalObject } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { getTelemetryObservable } from '../../../browser-core/src/domain/telemetry'
import { registerCleanupTask, replaceMockableWithSpy, waitNextMicrotask } from '../../../browser-core/test'
import { getOrCreateRumBuffer, startRumBuffer, createDataBuffer } from './rumBuffer'

const bufferGlobal = globalObject as typeof globalObject & { __DD_RUM_BUFFER__?: unknown }

describe('RUM buffer', () => {
  it('connects diagnostics to a separate SDK and releases the early telemetry history', async () => {
    const buffer = getOrCreateRumBuffer()
    const telemetry = getTelemetryObservable()
    const event = { rawEvent: { type: 'usage' as const, usage: { feature: 'source-code-context' as const } } }
    telemetry.notify(event)
    const notify = jasmine.createSpy()
    const internalError = jasmine.createSpy()
    buffer.connect({ notify }, internalError)
    await waitNextMicrotask()
    expect(notify).toHaveBeenCalledOnceWith(event)
    const error = new Error('collector failure')
    monitorError(error)
    expect(internalError).toHaveBeenCalledOnceWith(error)
    telemetry.notify(event)
    expect(notify).toHaveBeenCalledTimes(2)
    buffer.stop()
    telemetry.notify(event)
    monitorError(error)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(internalError).toHaveBeenCalledTimes(1)
  })

  it('does not connect diagnostics back to the same module instance', async () => {
    const buffer = getOrCreateRumBuffer()
    buffer.connect(getTelemetryObservable(), monitorError)
    const notify = jasmine.createSpy()
    getTelemetryObservable().subscribe(notify)
    getTelemetryObservable().notify({ rawEvent: { type: 'usage', usage: { feature: 'source-code-context' } } })
    await waitNextMicrotask()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  let errors: Observable<RawError>
  let collector: jasmine.Spy<typeof trackRuntimeError>

  beforeEach(() => {
    errors = new Observable()
    collector = replaceMockableWithSpy(trackRuntimeError).and.returnValue(errors)
    registerCleanupTask(() => {
      const buffer = bufferGlobal.__DD_RUM_BUFFER__ as ReturnType<typeof getOrCreateRumBuffer> | undefined
      buffer?.stop?.()
      delete bufferGlobal.__DD_RUM_BUFFER__
    })
  })

  function emit(message: string) {
    const error: RawError = { message, source: ErrorSource.SOURCE, startClocks: clocksNow() }
    errors.notify(error)
    return error
  }

  it('owns additional collectors and subscribes to each type only once', async () => {
    const buffer = createDataBuffer()
    registerCleanupTask(buffer.stop)
    const consoleSource = new Observable<Extract<BufferedData, { type: BufferedDataType.CONSOLE }>['data']>()
    const createSource = jasmine.createSpy().and.returnValue(consoleSource)
    buffer.subscribe(BufferedDataType.CONSOLE, createSource)
    buffer.subscribe(BufferedDataType.CONSOLE, createSource)
    const received: BufferedData[] = []
    buffer.observable.subscribe((event) => received.push(event))
    await waitNextMicrotask()
    const log = { api: 'log' as const, message: 'extra collector', handlingStack: '', error: undefined }
    consoleSource.notify(log)
    expect(createSource).toHaveBeenCalledTimes(1)
    expect(buffer.types).toContain(BufferedDataType.CONSOLE)
    expect(received).toEqual([{ type: BufferedDataType.CONSOLE, data: log }])
    buffer.stop()
    consoleSource.notify(log)
    expect(received.length).toBe(1)
  })

  it('gives Logs an independent buffer without consuming or stopping the early RUM buffer', async () => {
    startRumBuffer()
    const early = emit('before Logs')
    const logs = createDataBuffer()
    registerCleanupTask(logs.stop)
    const logsEvents: BufferedData[] = []
    logs.observable.subscribe((event) => logsEvents.push(event))
    logs.observable.unbuffer()
    await waitNextMicrotask()
    expect(logsEvents).toEqual([])

    const shared = emit('both SDKs')
    const rum = getOrCreateRumBuffer()
    const rumEvents: BufferedData[] = []
    rum.observable.subscribe((event) => rumEvents.push(event))
    rum.observable.unbuffer()
    await waitNextMicrotask()
    expect(rumEvents).toEqual([
      { type: BufferedDataType.RUNTIME_ERROR, data: early },
      { type: BufferedDataType.RUNTIME_ERROR, data: shared },
    ])
    expect(logsEvents).toEqual([{ type: BufferedDataType.RUNTIME_ERROR, data: shared }])
    logs.stop()
    emit('RUM continues')
    expect(logsEvents.length).toBe(1)
    expect(rumEvents.length).toBe(3)
    expect(collector).toHaveBeenCalledTimes(2)
  })

  it('reuses the early collector, replays errors once, and continues live delivery', async () => {
    startRumBuffer()
    const early = emit('early')
    startRumBuffer()
    const buffer = getOrCreateRumBuffer()
    const received: RawError[] = []
    buffer.observable.subscribe((event) => {
      if (event.type === BufferedDataType.RUNTIME_ERROR) {
        received.push(event.data)
      }
    })
    emit('during adoption')
    buffer.observable.unbuffer()
    await waitNextMicrotask()
    emit('live')
    expect(received.map((error) => error.message)).toEqual(['early', 'during adoption', 'live'])
    expect(received[0]).toBe(early)
    expect(collector).toHaveBeenCalledTimes(1)
    startRumBuffer()
    expect(getOrCreateRumBuffer()).toBe(buffer)
    expect(collector).toHaveBeenCalledTimes(1)
  })

  it('starts capture at SDK evaluation when no early script ran', async () => {
    const buffer = getOrCreateRumBuffer()
    emit('SDK only')
    const received: RawError[] = []
    buffer.observable.subscribe((event) => {
      if (event.type === BufferedDataType.RUNTIME_ERROR) {
        received.push(event.data)
      }
    })
    await waitNextMicrotask()
    expect(received.map((error) => error.message)).toEqual(['SDK only'])
  })

  it('keeps the latest 500 errors and reports drops when initialization releases the history', async () => {
    const buffer = getOrCreateRumBuffer()
    for (let i = 0; i < 505; i++) {
      emit(String(i))
    }
    const received: RawError[] = []
    const dropped = jasmine.createSpy()
    buffer.observable.subscribe((event) => {
      if (event.type === BufferedDataType.RUNTIME_ERROR) {
        received.push(event.data)
      }
    })
    getTelemetryObservable().subscribe(dropped)
    buffer.observable.unbuffer()
    await waitNextMicrotask()
    expect(received.length).toBe(500)
    expect(received[0].message).toBe('5')
    expect(received[499].message).toBe('504')
    expect(dropped).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        rawEvent: jasmine.objectContaining({ message: 'Early data collection dropped data on unbuffer', count: 5 }),
      })
    )
    const late = jasmine.createSpy()
    buffer.observable.subscribe(late)
    await waitNextMicrotask()
    expect(late).not.toHaveBeenCalled()
  })

  it('does not report discarded history after stopping', async () => {
    const buffer = createDataBuffer()
    const telemetry = jasmine.createSpy()
    getTelemetryObservable().subscribe(telemetry)
    for (let i = 0; i < 501; i++) {
      emit(String(i))
    }
    buffer.stop()
    await waitNextMicrotask()
    expect(telemetry).not.toHaveBeenCalled()
  })

  it('stops capture and does not restart when the early script runs again', async () => {
    const buffer = getOrCreateRumBuffer()
    const received = jasmine.createSpy()
    buffer.observable.subscribe(received)
    await waitNextMicrotask()
    buffer.stop()
    buffer.stop()
    emit('stopped')
    startRumBuffer()
    expect(received).not.toHaveBeenCalled()
    expect(collector).toHaveBeenCalledTimes(1)
  })

  it('reuses the existing source from another bundle', () => {
    const foreign = {
      types: [BufferedDataType.RUNTIME_ERROR],
      observable: { subscribe: jasmine.createSpy(), notify: jasmine.createSpy(), unbuffer: jasmine.createSpy() },
      subscribe: jasmine.createSpy(),
      stop: jasmine.createSpy(),
      connect: jasmine.createSpy(),
    }
    bufferGlobal.__DD_RUM_BUFFER__ = foreign
    expect(getOrCreateRumBuffer()).toEqual(jasmine.objectContaining(foreign))
    expect(collector).not.toHaveBeenCalled()
  })
})
