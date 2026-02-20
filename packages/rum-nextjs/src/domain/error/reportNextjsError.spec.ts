import type { RelativeTime, TimeStamp } from '@datadog/browser-core'
import { clocksNow, generateUUID, noop } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { registerCleanupTask, replaceMockable } from '../../../../core/test'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { nextjsPlugin, resetNextjsPlugin } from '../nextjsPlugin'
import { reportNextjsError } from './reportNextjsError'

const FAKE_RELATIVE_TIME = 100 as RelativeTime
const FAKE_TIMESTAMP = 1000 as TimeStamp
const FAKE_UUID = 'fake-uuid-1234'

describe('reportNextjsError', () => {
  beforeEach(() => {
    replaceMockable(clocksNow, () => ({ relative: FAKE_RELATIVE_TIME, timeStamp: FAKE_TIMESTAMP }))
    replaceMockable(generateUUID, () => FAKE_UUID)
  })

  it('reports an App Router error with digest', () => {
    const addEventSpy = jasmine.createSpy()
    initializeNextjsPlugin({ addEvent: addEventSpy })

    const error = new Error('Test error')
    ;(error as any).digest = 'abc123'

    reportNextjsError(error, noop)

    expect(addEventSpy).toHaveBeenCalledOnceWith(
      FAKE_RELATIVE_TIME,
      jasmine.objectContaining({
        type: RumEventType.ERROR,
        date: FAKE_TIMESTAMP,
        error: jasmine.objectContaining({
          id: FAKE_UUID,
          message: 'Test error',
          source: 'source',
          type: 'Error',
          handling: 'unhandled',
          source_type: 'browser',
        }),
        context: {
          framework: 'nextjs',
          router: 'app',
          digest: 'abc123',
        },
      }),
      { error }
    )
  })

  it('reports a Pages Router error with statusCode', () => {
    const addEventSpy = jasmine.createSpy()
    initializeNextjsPlugin({
      configuration: { router: 'pages' },
      addEvent: addEventSpy,
    })

    const error = new Error('Server error')

    reportNextjsError(error, 500)

    expect(addEventSpy).toHaveBeenCalledOnceWith(
      FAKE_RELATIVE_TIME,
      jasmine.objectContaining({
        context: {
          framework: 'nextjs',
          router: 'pages',
          statusCode: 500,
        },
      }),
      { error }
    )
  })

  it('detects App Router when second argument is a function', () => {
    const addEventSpy = jasmine.createSpy()
    initializeNextjsPlugin({ addEvent: addEventSpy })

    reportNextjsError(new Error('test'), noop)

    const event = addEventSpy.calls.mostRecent().args[1]
    expect(event.context.router).toBe('app')
  })

  it('detects Pages Router when second argument is a number', () => {
    const addEventSpy = jasmine.createSpy()
    initializeNextjsPlugin({ addEvent: addEventSpy })

    reportNextjsError(new Error('test'), 404)

    const event = addEventSpy.calls.mostRecent().args[1]
    expect(event.context.router).toBe('pages')
  })

  it('defaults to Pages Router when no second argument', () => {
    const addEventSpy = jasmine.createSpy()
    initializeNextjsPlugin({ addEvent: addEventSpy })

    reportNextjsError(new Error('test'))

    const event = addEventSpy.calls.mostRecent().args[1]
    expect(event.context.router).toBe('pages')
  })

  it('does not include digest when not present on error', () => {
    const addEventSpy = jasmine.createSpy()
    initializeNextjsPlugin({ addEvent: addEventSpy })

    reportNextjsError(new Error('test'), noop)

    const event = addEventSpy.calls.mostRecent().args[1]
    expect(event.context.digest).toBeUndefined()
  })

  it('queues the error if RUM has not started yet', () => {
    const addEventSpy = jasmine.createSpy()

    reportNextjsError(new Error('queued error'), noop)

    expect(addEventSpy).not.toHaveBeenCalled()

    const plugin = nextjsPlugin({ router: 'app' })
    plugin.onInit({
      publicApi: {} as RumPublicApi,
      initConfiguration: {} as RumInitConfiguration,
    })
    plugin.onRumStart({ addEvent: addEventSpy })

    registerCleanupTask(() => resetNextjsPlugin())

    expect(addEventSpy).toHaveBeenCalled()
  })
})
