import type { RelativeTime } from '@datadog/browser-core'
import { relativeToClocks } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test/specHelper'
import { setup } from '../../../test/specHelper'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../rumEventsCollection/view/trackViews'
import type { UrlContexts } from './urlContexts'
import { startUrlContexts } from './urlContexts'

describe('urlContexts', () => {
  let setupBuilder: TestSetupBuilder
  let urlContexts: UrlContexts

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('http://fake-url.com')
      .withFakeClock()
      .beforeBuild(({ lifeCycle, locationChangeObservable, location }) => {
        urlContexts = startUrlContexts(lifeCycle, locationChangeObservable, location)
        return urlContexts
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return undefined before the initial view', () => {
    setupBuilder.build()

    expect(urlContexts.findUrl()).toBeUndefined()
  })

  it('should not create url context on location change before the initial view', () => {
    const { changeLocation } = setupBuilder.build()

    changeLocation('/foo')

    expect(urlContexts.findUrl()).toBeUndefined()
  })

  it('should return current url and document referrer for initial view', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/')
    expect(urlContext.referrer).toBe(document.referrer)
  })

  it('should update url context on location change', () => {
    const { lifeCycle, changeLocation } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)
    changeLocation('/foo')

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toContain('http://fake-url.com/foo')
    expect(urlContext.referrer).toBe(document.referrer)
  })

  it('should update url context on new view', () => {
    const { lifeCycle, changeLocation } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)
    changeLocation('/foo')
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
      endClocks: relativeToClocks(10 as RelativeTime),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(10 as RelativeTime),
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/foo')
    expect(urlContext.referrer).toBe('http://fake-url.com/')
  })

  it('should return the url context corresponding to the start time', () => {
    const { lifeCycle, changeLocation, clock } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)

    clock.tick(10)
    changeLocation('/foo')
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
      endClocks: relativeToClocks(10 as RelativeTime),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(10 as RelativeTime),
    } as ViewCreatedEvent)

    clock.tick(10)
    changeLocation('/foo#bar')

    clock.tick(10)
    changeLocation('/qux')
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
      endClocks: relativeToClocks(30 as RelativeTime),
    } as ViewEndedEvent)
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
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
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
      endClocks: relativeToClocks(10 as RelativeTime),
    } as ViewEndedEvent)

    expect(urlContexts.findUrl()).toBeUndefined()
  })
})
