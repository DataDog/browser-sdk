import { monitorError, startMonitorErrorCollection, stopMonitorErrorCollection } from '@datadog/js-core/monitor'
import { trackRuntimeError, BufferedDataType } from '@datadog/browser-core'
import type { RuntimeError, BufferedData } from '@datadog/browser-core'
import { Observable, globalObject } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { registerCleanupTask, replaceMockableWithSpy, waitNextMicrotask } from '../../../browser-core/test'
import { getOrCreateRumBuffer, startRumBuffer, createDataBuffer } from './rumBuffer'

const bufferGlobal = globalObject as typeof globalObject & { __DD_RUM_BUFFER__?: unknown }

describe('RUM buffer', () => {
  it('connects internal errors to a separate SDK and disconnects when stopped', () => {
    const buffer = getOrCreateRumBuffer()
    const internalError = jasmine.createSpy()
    buffer.connect(internalError)
    const error = new Error('collector failure')
    monitorError(error)
    expect(internalError).toHaveBeenCalledOnceWith(error)
    buffer.stop()
    monitorError(error)
    expect(internalError).toHaveBeenCalledTimes(1)
  })

  it('does not connect the monitor back to itself or replace the existing SDK sink', () => {
    const internalError = jasmine.createSpy()
    startMonitorErrorCollection(internalError)
    registerCleanupTask(stopMonitorErrorCollection)
    const buffer = getOrCreateRumBuffer()
    buffer.connect(monitorError)
    const error = new Error('collector failure')
    monitorError(error)
    buffer.stop()
    monitorError(error)
    expect(internalError).toHaveBeenCalledTimes(2)
  })

  let errors: Observable<RuntimeError>
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
    const error: RuntimeError = { originalError: message, startClocks: clocksNow() }
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
    const received: RuntimeError[] = []
    buffer.observable.subscribe((event) => {
      if (event.type === BufferedDataType.RUNTIME_ERROR) {
        received.push(event.data)
      }
    })
    emit('during adoption')
    buffer.observable.unbuffer()
    await waitNextMicrotask()
    emit('live')
    expect(received.map((error) => error.originalError)).toEqual(['early', 'during adoption', 'live'])
    expect(received[0]).toBe(early)
    expect(collector).toHaveBeenCalledTimes(1)
    startRumBuffer()
    expect(getOrCreateRumBuffer()).toBe(buffer)
    expect(collector).toHaveBeenCalledTimes(1)
  })

  it('starts capture at SDK evaluation when no early script ran', async () => {
    const buffer = getOrCreateRumBuffer()
    emit('SDK only')
    const received: RuntimeError[] = []
    buffer.observable.subscribe((event) => {
      if (event.type === BufferedDataType.RUNTIME_ERROR) {
        received.push(event.data)
      }
    })
    await waitNextMicrotask()
    expect(received.map((error) => error.originalError)).toEqual(['SDK only'])
  })

  it('keeps the latest 500 errors until initialization releases the history', async () => {
    const buffer = getOrCreateRumBuffer()
    for (let i = 0; i < 505; i++) {
      emit(String(i))
    }
    const received: RuntimeError[] = []
    buffer.observable.subscribe((event) => {
      if (event.type === BufferedDataType.RUNTIME_ERROR) {
        received.push(event.data)
      }
    })
    buffer.observable.unbuffer()
    await waitNextMicrotask()
    expect(received.length).toBe(500)
    expect(received[0].originalError).toBe('5')
    expect(received[499].originalError).toBe('504')
    const late = jasmine.createSpy()
    buffer.observable.subscribe(late)
    await waitNextMicrotask()
    expect(late).not.toHaveBeenCalled()
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
