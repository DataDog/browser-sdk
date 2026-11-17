import { PageExitReason } from '@datadog/browser-core'
import { registerCleanupTask, startMockTelemetry } from '@datadog/browser-core/test'
import { clocksNow } from '@datadog/js-core/time'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { MAX_TRACKED_OPEN_OPERATIONS, trackOpenOperations } from './trackOpenOperations'

describe('trackOpenOperations', () => {
  let lifeCycle: LifeCycle
  let abandonOperationSpy: jasmine.Spy<(name: string, operationKey: string | undefined) => void>
  let tracker: ReturnType<typeof trackOpenOperations>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    abandonOperationSpy = jasmine.createSpy('abandonOperation')
    tracker = trackOpenOperations(lifeCycle, abandonOperationSpy)
    registerCleanupTask(tracker.stop)
  })

  function terminatePage() {
    lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)
  }

  it('abandons an open operation when the page is terminated', () => {
    tracker.start('foo', 'key')

    terminatePage()

    expect(abandonOperationSpy).toHaveBeenCalledOnceWith('foo', 'key')
  })

  it('abandons open operations only once', () => {
    tracker.start('foo', undefined)

    terminatePage()
    terminatePage()

    expect(abandonOperationSpy).toHaveBeenCalledTimes(1)
  })

  it('does not abandon operations that already ended', () => {
    tracker.start('foo', 'key')
    tracker.end('foo', 'key')

    terminatePage()

    expect(abandonOperationSpy).not.toHaveBeenCalled()
  })

  it('abandons each start of the same operation separately', () => {
    tracker.start('foo', 'key')
    tracker.start('foo', 'key')
    tracker.start('foo', 'key')
    tracker.end('foo', 'key')

    terminatePage()

    expect(abandonOperationSpy.calls.allArgs()).toEqual([
      ['foo', 'key'],
      ['foo', 'key'],
    ])
  })

  it('matches ends on both the name and the operation key', () => {
    tracker.start('foo', 'a')
    tracker.start('foo', undefined)
    tracker.start('a:b', undefined)
    tracker.start('a', 'b')
    tracker.end('foo', undefined)
    tracker.end('a', 'b')

    terminatePage()

    expect(abandonOperationSpy.calls.allArgs()).toEqual([
      ['foo', 'a'],
      ['a:b', undefined],
    ])
  })

  it('ignores an end without a tracked start', () => {
    tracker.end('foo', 'key')

    terminatePage()

    expect(abandonOperationSpy).not.toHaveBeenCalled()
  })
  ;[PageExitReason.HIDDEN, PageExitReason.FROZEN, PageExitReason.UNLOADING].forEach((reason) => {
    it(`does not abandon open operations on "${reason}"`, () => {
      tracker.start('foo', undefined)

      lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, reason)
      expect(abandonOperationSpy).not.toHaveBeenCalled()

      terminatePage()
      expect(abandonOperationSpy).toHaveBeenCalledOnceWith('foo', undefined)
    })
  })

  it('forgets open operations when the session expires', () => {
    tracker.start('foo', undefined)

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, { endClocks: clocksNow() })
    terminatePage()

    expect(abandonOperationSpy).not.toHaveBeenCalled()
  })

  it('forgets open operations when the session is renewed', () => {
    tracker.start('foo', undefined)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    terminatePage()

    expect(abandonOperationSpy).not.toHaveBeenCalled()
  })

  it('tracks operations started after the session is renewed', () => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    tracker.start('foo', undefined)

    terminatePage()

    expect(abandonOperationSpy).toHaveBeenCalledOnceWith('foo', undefined)
  })

  it('drops the oldest open operations beyond the limit', () => {
    for (let i = 0; i <= MAX_TRACKED_OPEN_OPERATIONS; i++) {
      tracker.start(`operation-${i}`, undefined)
    }

    terminatePage()

    const abandonedNames = abandonOperationSpy.calls.allArgs().map(([name]) => name)
    expect(abandonedNames.length).toBe(MAX_TRACKED_OPEN_OPERATIONS)
    expect(abandonedNames).not.toContain('operation-0')
    expect(abandonedNames).toContain(`operation-${MAX_TRACKED_OPEN_OPERATIONS}`)
  })

  it('reports reaching the limit once', async () => {
    const telemetry = startMockTelemetry()

    for (let i = 0; i < MAX_TRACKED_OPEN_OPERATIONS + 2; i++) {
      tracker.start(`operation-${i}`, undefined)
    }

    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'Open operations limit reached',
        limit: MAX_TRACKED_OPEN_OPERATIONS,
      }),
    ])
  })

  it('does not abandon anything once stopped', () => {
    tracker.start('foo', undefined)

    tracker.stop()
    terminatePage()

    expect(abandonOperationSpy).not.toHaveBeenCalled()
  })
})
