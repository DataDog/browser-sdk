import type { RumPluginOnInitOptions } from '@datadog/browser-rum-core'
import { RumEventType, RumLongTaskEntryType } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { longTaskPlugin } from './index'

// Minimal PerformanceObserver mock: enough to control which entryType the plugin subscribes to
// and to trigger the REAL instance the plugin registered (not a decoy) with a fake entry, without
// depending on browser-rum-core's internal test utils (keeps this package's test surface
// self-contained, matching how it would be if it were truly external to the monorepo).
function mockPerformanceObserver(supportedEntryTypes: string[]) {
  const original = window.PerformanceObserver
  const instances = new Set<MockPerformanceObserver>()

  class MockPerformanceObserver {
    static supportedEntryTypes = supportedEntryTypes
    entryTypes: string[] = []
    constructor(public callback: PerformanceObserverCallback) {}
    observe({ entryTypes, type }: PerformanceObserverInit) {
      this.entryTypes = entryTypes || (type ? [type] : [])
      instances.add(this)
    }
    disconnect() {
      instances.delete(this)
    }
    takeRecords() {
      return []
    }
  }

  window.PerformanceObserver = MockPerformanceObserver
  registerCleanupTask(() => {
    window.PerformanceObserver = original
  })

  return {
    notify: (entry: object) => {
      instances.forEach((instance) => {
        if (instance.entryTypes.includes((entry as { entryType: string }).entryType)) {
          instance.callback(
            { getEntries: () => [entry] as PerformanceEntryList } as PerformanceObserverEntryList,
            instance
          )
        }
      })
    },
  }
}

function fakeLongAnimationFrameEntry() {
  return {
    entryType: 'long-animation-frame',
    startTime: 1234,
    duration: 82,
    blockingDuration: 0,
    firstUIEventTimestamp: 0,
    renderStart: 1421.5,
    styleAndLayoutStart: 1428,
    scripts: [],
  }
}

describe('longTaskPlugin (spike)', () => {
  it('is named "long-task"', () => {
    expect(longTaskPlugin().name).toBe('long-task')
  })

  it('submits an event immediately when onRumStart already fired before the entry arrives', () => {
    const { notify } = mockPerformanceObserver(['long-animation-frame'])
    const plugin = longTaskPlugin()
    const addEvent = jasmine.createSpy('addEvent')

    void plugin.onInit!({ initConfiguration: {} } as RumPluginOnInitOptions)
    plugin.onRumStart!({ addEvent })

    notify(fakeLongAnimationFrameEntry())

    expect(addEvent).toHaveBeenCalledTimes(1)
    const [startTime, event] = addEvent.calls.argsFor(0)
    expect(startTime).toBe(1234)
    expect(event).toEqual(
      jasmine.objectContaining({
        type: RumEventType.LONG_TASK,
        long_task: jasmine.objectContaining({
          entry_type: RumLongTaskEntryType.LONG_ANIMATION_FRAME,
          id: jasmine.any(String),
        }),
      })
    )
  })

  it('queues events observed before onRumStart and flushes them once addEvent becomes available', () => {
    const { notify } = mockPerformanceObserver(['long-animation-frame'])
    const plugin = longTaskPlugin()
    const addEvent = jasmine.createSpy('addEvent')

    void plugin.onInit!({ initConfiguration: {} } as RumPluginOnInitOptions)
    notify(fakeLongAnimationFrameEntry())

    expect(addEvent).not.toHaveBeenCalled()

    plugin.onRumStart!({ addEvent })

    expect(addEvent).toHaveBeenCalledTimes(1)
  })

  it('does not observe at all when trackLongTasks is explicitly false', () => {
    mockPerformanceObserver(['long-animation-frame'])
    const plugin = longTaskPlugin()
    const addEvent = jasmine.createSpy('addEvent')

    void plugin.onInit!({ initConfiguration: { trackLongTasks: false } } as RumPluginOnInitOptions)
    plugin.onRumStart!({ addEvent })

    expect(addEvent).not.toHaveBeenCalled()
  })
})
