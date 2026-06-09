import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocksNow } from '@datadog/js-core/time'
import type { BufferedData, ConsoleLog, ErrorWithCause, RawError } from '@datadog/browser-core'
import {
  BufferedDataType,
  ConsoleApiName,
  ErrorHandling,
  ErrorSource,
  Observable,
  noop,
  objectEntries,
  startBufferingData,
} from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RawConsoleLogsEvent } from '../../rawLogsEvent.types'
import { validateAndBuildLogsConfiguration } from '../configuration'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startConsoleCollection, LogStatusForApi } from './consoleCollection'

describe('console collection', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let stopConsoleCollection: () => void
  let lifeCycle: LifeCycle
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawConsoleLogsEvent>>
  let bufferedDataObservable: Observable<BufferedData>

  function notifyConsole(log: ConsoleLog) {
    bufferedDataObservable.notify({ type: BufferedDataType.CONSOLE, data: log })
  }

  function makeRawError(overrides: Partial<RawError> = {}): RawError {
    return {
      startClocks: clocksNow(),
      message: 'error message',
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      type: undefined,
      stack: undefined,
      causes: undefined,
      fingerprint: undefined,
      context: undefined,
      ...overrides,
    }
  }

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    bufferedDataObservable = new Observable<BufferedData>()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawConsoleLogsEvent>)
    )
    stopConsoleCollection = noop
    vi.spyOn(console, 'log').mockImplementation(() => true)
    vi.spyOn(console, 'debug').mockImplementation(() => true)
    vi.spyOn(console, 'info').mockImplementation(() => true)
    vi.spyOn(console, 'warn').mockImplementation(() => true)
    vi.spyOn(console, 'error').mockImplementation(() => true)
  })

  afterEach(() => {
    stopConsoleCollection()
  })

  objectEntries(LogStatusForApi).forEach(([api, status]) => {
    it(`should collect ${status} logs from console.${api}`, () => {
      ;({ stop: stopConsoleCollection } = startConsoleCollection(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: 'all' })!,
        lifeCycle,
        bufferedDataObservable
      ))

      notifyConsole({
        api: api as ConsoleApiName,
        message: 'foo bar',
        handlingStack: 'at foo',
        error: undefined,
      } as ConsoleLog)

      expect(rawLogsEvents[0].rawLogsEvent).toMatchObject({
        message: 'foo bar',
        status,
        origin: ErrorSource.CONSOLE,
      })
      expect(typeof rawLogsEvents[0].rawLogsEvent.date).toBe('number')

      expect(rawLogsEvents[0].domainContext).toMatchObject({
        handlingStack: expect.any(String),
      })
    })

    it(`should not collect logs from console.${api} if not configured`, () => {
      ;({ stop: stopConsoleCollection } = startConsoleCollection(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: [] })!,
        lifeCycle,
        bufferedDataObservable
      ))

      notifyConsole({
        api: api as ConsoleApiName,
        message: 'foo bar',
        handlingStack: 'at foo',
        error: undefined,
      } as ConsoleLog)

      expect(rawLogsEvents.length).toBe(0)
    })
  })

  it('console error should have an error object defined', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['error'] })!,
      lifeCycle,
      bufferedDataObservable
    ))

    notifyConsole({
      api: ConsoleApiName.error,
      message: 'foo bar',
      handlingStack: '',
      error: makeRawError(),
    })

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      stack: undefined,
      fingerprint: undefined,
      causes: undefined,
      handling: ErrorHandling.HANDLED,
      kind: undefined,
      message: undefined,
    })
  })

  it('should use error context as message context', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['error'] })!,
      lifeCycle,
      bufferedDataObservable
    ))

    notifyConsole({
      api: ConsoleApiName.error,
      message: 'Error: foo',
      handlingStack: '',
      error: makeRawError({ context: { foo: 'bar' } }),
    })

    expect(rawLogsEvents[0].messageContext).toEqual({ foo: 'bar' })
  })

  it('should retrieve causes from console error', async () => {
    const { observable: consoleBufferedObservable, stop: stopBuffering } = startBufferingData()
    registerCleanupTask(stopBuffering)
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['error'] })!,
      lifeCycle,
      consoleBufferedObservable
    ))
    const error = new Error('High level error') as ErrorWithCause
    error.stack = 'Error: High level error'

    const nestedError = new Error('Mid level error') as ErrorWithCause
    nestedError.stack = 'Error: Mid level error'

    const deepNestedError = new TypeError('Low level error') as ErrorWithCause
    deepNestedError.stack = 'TypeError: Low level error'

    nestedError.cause = deepNestedError
    error.cause = nestedError

    // eslint-disable-next-line no-console
    console.error(error)

    // Wait for BufferedObservable microtask to deliver the event to subscribers
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      stack: expect.any(String),
      handling: ErrorHandling.HANDLED,
      causes: [
        {
          source: ErrorSource.CONSOLE,
          type: 'Error',
          stack: expect.any(String),
          message: 'Mid level error',
        },
        {
          source: ErrorSource.CONSOLE,
          type: 'TypeError',
          stack: expect.any(String),
          message: 'Low level error',
        },
      ],
      fingerprint: undefined,
      kind: 'Error',
      message: undefined,
    })
  })
})
