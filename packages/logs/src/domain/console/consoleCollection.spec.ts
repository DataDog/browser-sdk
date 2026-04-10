import type { BufferedData, ConsoleLog, RawError, Context } from '@datadog/browser-core'
import {
  BufferedDataType,
  ConsoleApiName,
  ErrorHandling,
  ErrorSource,
  Observable,
  clocksNow,
  noop,
  objectEntries,
} from '@datadog/browser-core'
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

      expect(rawLogsEvents[0].rawLogsEvent).toEqual({
        date: jasmine.any(Number),
        message: 'foo bar',
        status,
        origin: ErrorSource.CONSOLE,
        error: whatever(),
      })

      expect(rawLogsEvents[0].domainContext).toEqual({
        handlingStack: jasmine.any(String),
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

  it('should retrieve fingerprint from console error', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['error'] })!,
      lifeCycle,
      bufferedDataObservable
    ))

    notifyConsole({
      api: ConsoleApiName.error,
      message: 'Error: foo',
      handlingStack: '',
      error: makeRawError({ type: 'Error', stack: 'Error: foo\n    at ...', fingerprint: 'my-fingerprint' }),
    })

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      stack: jasmine.any(String),
      fingerprint: 'my-fingerprint',
      causes: undefined,
      handling: ErrorHandling.HANDLED,
      kind: 'Error',
      message: undefined,
    })
  })

  it('should retrieve dd_context from console', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['error'] })!,
      lifeCycle,
      bufferedDataObservable
    ))

    notifyConsole({
      api: ConsoleApiName.error,
      message: 'Error: foo',
      handlingStack: '',
      error: makeRawError({ context: { foo: 'bar' } as Context }),
    })

    expect(rawLogsEvents[0].messageContext).toEqual({ foo: 'bar' })
  })

  it('should retrieve causes from console error', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['error'] })!,
      lifeCycle,
      bufferedDataObservable
    ))

    notifyConsole({
      api: ConsoleApiName.error,
      message: 'Error: High level error',
      handlingStack: '',
      error: makeRawError({
        type: 'Error',
        stack: 'Error: High level error',
        causes: [
          {
            source: ErrorSource.CONSOLE,
            type: 'Error',
            stack: 'Error: Mid level error',
            message: 'Mid level error',
          },
          {
            source: ErrorSource.CONSOLE,
            type: 'TypeError',
            stack: 'TypeError: Low level error',
            message: 'Low level error',
          },
        ],
      }),
    })

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      stack: jasmine.any(String),
      handling: ErrorHandling.HANDLED,
      causes: [
        {
          source: ErrorSource.CONSOLE,
          type: 'Error',
          stack: jasmine.any(String),
          message: 'Mid level error',
        },
        {
          source: ErrorSource.CONSOLE,
          type: 'TypeError',
          stack: jasmine.any(String),
          message: 'Low level error',
        },
      ],
      fingerprint: undefined,
      kind: 'Error',
      message: undefined,
    })
  })
})

function whatever() {
  return {
    asymmetricMatch: () => true,
    jasmineToString: () => '<whatever>',
  }
}
