import type { RelativeTime } from '@datadog/browser-core'
import { relativeToClocks } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { buildLocation, mockClock } from '@datadog/browser-core/test'
import { setupLocationObserver } from '../../../test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../view/trackViews'
import type { UrlContexts } from './urlContexts'
import { startUrlContexts } from './urlContexts'

describe('urlContexts', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let changeLocation: (to: string) => void
  let urlContexts: UrlContexts

  beforeEach(() => {
    const fakeLocation = buildLocation('http://fake-url.com')
    clock = mockClock()
    const setupResult = setupLocationObserver()
    changeLocation = (to: string) => setupResult.changeLocation(fakeLocation, to)
    urlContexts = startUrlContexts(lifeCycle, setupResult.observable, fakeLocation)
  })

  afterEach(() => {
    urlContexts.stop()
    clock.cleanup()
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
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)

    clock.tick(10)
    changeLocation('/foo')
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
      endClocks: relativeToClocks(10 as RelativeTime),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(10 as RelativeTime),
    } as ViewCreatedEvent)

    clock.tick(10)
    changeLocation('/foo#bar')

    clock.tick(10)
    changeLocation('/qux')
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
      endClocks: relativeToClocks(30 as RelativeTime),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(30 as RelativeTime),
    } as ViewCreatedEvent)

    expect(urlContexts.findUrl(5 as RelativeTime)).toEqual({
      url: 'http://fake-url.com/',
      referrer: document.referrer,
    })
    expect(urlContexts.findUrl(15 as RelativeTime)).toEqual({
      url: 'http://fake-url.com/foo',
      referrer: 'http://fake-url.com/',
    })
    expect(urlContexts.findUrl(25 as RelativeTime)).toEqual({
      url: 'http://fake-url.com/foo#bar',
      referrer: 'http://fake-url.com/',
    })
    expect(urlContexts.findUrl(35 as RelativeTime)).toEqual({
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
})
