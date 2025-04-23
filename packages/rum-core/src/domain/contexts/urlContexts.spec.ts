import { mockClock, registerCleanupTask, type Clock } from '@datadog/browser-core/test'
import type { RelativeTime } from '@datadog/browser-core'
import { clocksNow, relativeToClocks } from '@datadog/browser-core'
import { setupLocationObserver } from '../../../test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../view/trackViews'
import type { Hooks } from '../../hooks'
import { HookNames, createHooks } from '../../hooks'
import { startUrlContexts, type UrlContexts } from './urlContexts'

describe('urlContexts', () => {
  const lifeCycle = new LifeCycle()
  let changeLocation: (to: string) => void
  let urlContexts: UrlContexts
  let clock: Clock
  let hooks: Hooks

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()
    const setupResult = setupLocationObserver('http://fake-url.com')

    changeLocation = setupResult.changeLocation
    urlContexts = startUrlContexts(lifeCycle, hooks, setupResult.locationChangeObservable, setupResult.fakeLocation)

    registerCleanupTask(() => {
      urlContexts.stop()
      clock.cleanup()
    })
  })

  it('should return undefined before the initial view', () => {
    expect(urlContexts.findUrl()).toBeUndefined()
  })

  it('should not create url context on location change before the initial view', () => {
    changeLocation('/foo')

    expect(urlContexts.findUrl()).toBeUndefined()
  })

  it('should return current url and document referrer for initial view', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/')
    expect(urlContext.referrer).toBe(document.referrer)
  })

  it('should update url context on location change', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)
    changeLocation('/foo')

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toContain('http://fake-url.com/foo')
    expect(urlContext.referrer).toBe(document.referrer)
  })

  it('should update url context on new view', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)
    changeLocation('/foo')
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
      endClocks: relativeToClocks(10 as RelativeTime),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(10 as RelativeTime),
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/foo')
    expect(urlContext.referrer).toBe('http://fake-url.com/')
  })

  it('should return the url context corresponding to the start time', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: clocksNow(),
    } as ViewCreatedEvent)

    clock.tick(10)
    changeLocation('/foo')
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
      endClocks: clocksNow(),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: clocksNow(),
    } as ViewCreatedEvent)

    clock.tick(10)
    changeLocation('/foo#bar')

    clock.tick(10)
    changeLocation('/qux')
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
      endClocks: clocksNow(),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: clocksNow(),
    } as ViewCreatedEvent)

    expect(urlContexts.findUrl(clock.relative(5))).toEqual({
      url: 'http://fake-url.com/',
      referrer: document.referrer,
    })
    expect(urlContexts.findUrl(clock.relative(15))).toEqual({
      url: 'http://fake-url.com/foo',
      referrer: 'http://fake-url.com/',
    })
    expect(urlContexts.findUrl(clock.relative(25))).toEqual({
      url: 'http://fake-url.com/foo#bar',
      referrer: 'http://fake-url.com/',
    })
    expect(urlContexts.findUrl(clock.relative(35))).toEqual({
      url: 'http://fake-url.com/qux',
      referrer: 'http://fake-url.com/foo',
    })
  })

  /**
   * It could happen if there is an event happening just between view end and view creation
   * (which seems unlikely) and this event would anyway be rejected by lack of view id
   */
  it('should return undefined when no current view', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
      endClocks: relativeToClocks(10 as RelativeTime),
    } as ViewEndedEvent)

    expect(urlContexts.findUrl()).toBeUndefined()
  })

  describe('assemble hook', () => {
    it('should add url properties from the history', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual(
        jasmine.objectContaining({
          view: {
            url: jasmine.any(String),
            referrer: jasmine.any(String),
          },
        })
      )
    })
  })
})
