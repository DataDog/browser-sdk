import type { Subscription } from '@datadog/browser-core'
import { Observable, ONE_SECOND } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import {
  appendElement,
  createMutationRecord,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../test'
import type { RumPerformanceEntry } from '../browser/performanceObservable'
import { RumPerformanceEntryType } from '../browser/performanceObservable'
import type { RumMutationRecord } from '../browser/domMutationObservable'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import type { PageActivityEvent, PageActivityEndEvent } from './waitPageActivityEnd'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_VALIDATION_DELAY,
  doWaitPageActivityEnd,
  createPageActivityObservable,
  EXCLUDED_MUTATIONS_ATTRIBUTE,
} from './waitPageActivityEnd'
import type { RumConfiguration } from './configuration'

// Used to wait some time after the creation of an action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time before the (potential) end of an action
const BEFORE_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 0.8
// Arbitrary maximum duration to be used to test page activities max duration
const MAX_DURATION = 10 * ONE_SECOND
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = MAX_DURATION * 10

const FAKE_URL = 'https://example.com'
const EXCLUDED_FAKE_URL = 'https://example.com/excluded'

function eventsCollector<T>() {
  const events: T[] = []
  beforeEach(() => {
    events.length = 0
  })
  return {
    events,
    pushEvent: (event: T) => {
      events.push(event)
    },
  }
}

const RUM_CONFIGURATION = mockRumConfiguration()

describe('createPageActivityObservable', () => {
  const { events, pushEvent } = eventsCollector<PageActivityEvent>()

  const lifeCycle = new LifeCycle()
  const domMutationObservable = new Observable<RumMutationRecord[]>()
  const windowOpenObservable = new Observable<void>()
  let pageActivitySubscription: Subscription
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function startListeningToPageActivities(
    extraConfiguration: Partial<RumConfiguration> = { excludedActivityUrls: [EXCLUDED_FAKE_URL] }
  ) {
    const pageActivityObservable = createPageActivityObservable(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      {
        ...RUM_CONFIGURATION,
        ...extraConfiguration,
      }
    )
    pageActivitySubscription = pageActivityObservable.subscribe(pushEvent)
  }

  beforeEach(() => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
  })

  afterEach(() => {
    pageActivitySubscription.unsubscribe()
  })

  describe('dom mutation', () => {
    it('emits an activity event on dom mutation', () => {
      startListeningToPageActivities()
      domMutationObservable.notify([createMutationRecord()])
      expect(events).toEqual([{ isBusy: false }])
    })

    describe('dom mutation ignoring', () => {
      it('does not collect DOM mutation when an element is added and the parent is ignored', () => {
        startListeningToPageActivities()
        const target = appendElement(`<div ${EXCLUDED_MUTATIONS_ATTRIBUTE}><button /></div>`)

        domMutationObservable.notify([createMutationRecord('childList', { target })])
        expect(events).toEqual([])
      })

      it('does not collect DOM mutation in a deeply nested child of an ignored element', () => {
        startListeningToPageActivities()
        const target = appendElement(
          `<div ${EXCLUDED_MUTATIONS_ATTRIBUTE}><div><div><button target /></div></div></div>`
        )

        domMutationObservable.notify([createMutationRecord('childList', { target })])
        expect(events).toEqual([])
      })

      it('does not collect DOM mutation when a text node is added and the parent is ignored', () => {
        startListeningToPageActivities()
        const container = appendElement(`<div ${EXCLUDED_MUTATIONS_ATTRIBUTE}>foo</div>`)
        const target = container.childNodes[0] as Text

        domMutationObservable.notify([createMutationRecord('characterData', { target })])
        expect(events).toEqual([])
      })

      it('does not collect DOM mutation on attribute creation of ignored element', () => {
        startListeningToPageActivities()
        const target = appendElement(`<div ${EXCLUDED_MUTATIONS_ATTRIBUTE}></div>`)

        domMutationObservable.notify([createMutationRecord('attributes', { target })])
        expect(events).toEqual([])
      })
    })
  })

  it('emits an activity event on resource collected', () => {
    startListeningToPageActivities()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])

    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    startListeningToPageActivities()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])

    expect(events).toEqual([])
  })

  it('emits an activity event when `window.open` is used', () => {
    startListeningToPageActivities()
    windowOpenObservable.notify()
    expect(events).toEqual([{ isBusy: false }])
  })

  it('stops emitting activities after calling stop()', () => {
    startListeningToPageActivities()
    domMutationObservable.notify([createMutationRecord()])
    expect(events).toEqual([{ isBusy: false }])

    pageActivitySubscription.unsubscribe()

    domMutationObservable.notify([createMutationRecord()])
    domMutationObservable.notify([createMutationRecord()])

    expect(events).toEqual([{ isBusy: false }])
  })

  describe('programmatic requests', () => {
    it('emits an activity event when a request starts', () => {
      startListeningToPageActivities()
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10))
      expect(events).toEqual([{ isBusy: true }])
    })

    it('emits an activity event when a request completes', () => {
      startListeningToPageActivities()
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: false }])
    })

    it('ignores requests that has started before', () => {
      startListeningToPageActivities()
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([])
    })

    it('keeps emitting busy events while all requests are not completed', () => {
      startListeningToPageActivities()
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10))
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(11))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(9))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(11))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: true }, { isBusy: true }, { isBusy: false }])
    })

    describe('excludedActivityUrls', () => {
      it('ignores resources that should be excluded by configuration', () => {
        startListeningToPageActivities({
          excludedActivityUrls: [
            /^https?:\/\/qux\.com.*/,
            'http://bar.com',
            (url: string) => url === 'http://dynamic.com',
          ],
        })

        notifyPerformanceEntries([
          createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: 'http://qux.com' }),
          createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: 'http://bar.com' }),
          createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: 'http://dynamic.com' }),
        ])

        expect(events).toEqual([])
      })

      it('ignores requests that should be excluded by configuration', () => {
        startListeningToPageActivities()
        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10, EXCLUDED_FAKE_URL))
        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10, EXCLUDED_FAKE_URL))
        expect(events).toEqual([])
      })

      it("ignored requests don't interfere with pending requests count", () => {
        startListeningToPageActivities()
        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(9))
        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10, EXCLUDED_FAKE_URL))
        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10, EXCLUDED_FAKE_URL))
        expect(events).toEqual([{ isBusy: true }])
      })
    })

    function makeFakeRequestCompleteEvent(requestIndex: number, url = FAKE_URL) {
      return { requestIndex, url } as RequestCompleteEvent
    }
    function makeFakeRequestStartEvent(requestIndex: number, url = FAKE_URL): RequestStartEvent {
      return { requestIndex, url }
    }
  })
})

describe('doWaitPageActivityEnd', () => {
  let clock: Clock
  let idlPageActivityCallbackSpy: jasmine.Spy<(event: PageActivityEndEvent) => void>

  beforeEach(() => {
    idlPageActivityCallbackSpy = jasmine.createSpy()
    clock = mockClock()
  })

  it('should notify the callback after `EXPIRE_DELAY` when there is no activity', () => {
    doWaitPageActivityEnd(new Observable(), idlPageActivityCallbackSpy)

    clock.tick(EXPIRE_DELAY)

    expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
      hadActivity: false,
    })
  })

  it('should notify the callback with the last activity timestamp', () => {
    const activityObservable = new Observable<PageActivityEvent>()

    doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    activityObservable.notify({ isBusy: false })

    clock.tick(EXPIRE_DELAY)

    expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
      hadActivity: true,
      end: clock.timeStamp(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY),
    })
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      // Extend the action 10 times
      const extendCount = 10

      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy)

      for (let i = 0; i < extendCount; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: clock.timeStamp(extendCount * BEFORE_PAGE_ACTIVITY_END_DELAY),
      })
    })

    it('expires after a maximum duration', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false

      // Extend the action until it's more than MAX_DURATION
      const extendCount = Math.ceil(MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY + 1)

      idlPageActivityCallbackSpy.and.callFake(() => {
        stop = true
      })
      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy, MAX_DURATION)

      for (let i = 0; i < extendCount && !stop; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: clock.timeStamp(MAX_DURATION),
      })
    })
  })

  describe('busy activities', () => {
    it('is extended while the page is busy', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(PAGE_ACTIVITY_END_DELAY * 2)
      activityObservable.notify({ isBusy: false })

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: clock.timeStamp(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + PAGE_ACTIVITY_END_DELAY * 2),
      })
    })

    it('expires is the page is busy for too long', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy, MAX_DURATION)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: clock.timeStamp(MAX_DURATION),
      })
    })
  })
})
