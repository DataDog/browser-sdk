import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import type { RelativeTime } from '@datadog/browser-core'
import { clocksNow, DISCARDED, HookNames, relativeToClocks } from '@datadog/browser-core'
import { setupLocationObserver } from '../../../test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../view/trackViews'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'
import { startUrlContexts, urlContextsDecoratorFactory, type UrlContexts } from './urlContexts'

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
    urlContexts = startUrlContexts(lifeCycle, hooks, setupResult.locationChangeObservable)

    registerCleanupTask(() => {
      urlContexts.stop()
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

  it('should use the provided url override instead of location', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
      url: 'https://example.com/overridden-path',
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('https://example.com/overridden-path')
    expect(urlContext.referrer).toBe(document.referrer)
  })

  it('should resolve a relative url override against the current location', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
      url: '/dashboard',
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/dashboard')
  })

  it('should fall back to location.href when no url override is provided', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/')
  })

  it('should fall back to location.href when url override is explicitly undefined', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: relativeToClocks(0 as RelativeTime),
      url: undefined,
    } as ViewCreatedEvent)

    const urlContext = urlContexts.findUrl()!
    expect(urlContext.url).toBe('http://fake-url.com/')
  })

  it('should use the provided url override for events starting before a location change', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
      startClocks: clocksNow(),
      url: 'https://example.com/manual-url',
    } as ViewCreatedEvent)

    clock.tick(10)
    const resourceStartTime = clock.relative(10)

    clock.tick(10)
    changeLocation('/new-path')

    expect(urlContexts.findUrl(resourceStartTime)).toEqual({
      url: 'https://example.com/manual-url',
      referrer: document.referrer,
    })
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

  describe('urlContextsDecoratorFactory', () => {
    it('should contribute url and referrer when url context is found', async () => {
      const factory = urlContextsDecoratorFactory({
        findUrlContext: () => ({ url: 'https://example.com/', referrer: 'https://referrer.com/' }),
      })
      const decorator = factory.create({})
      const obs: Observation = { type: 'action', startTime: 0, data: {} }
      const result = await decorator.decorate(obs, {})
      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect((result.attributes as any).view.url).toBe('https://example.com/')
        expect((result.attributes as any).view.referrer).toBe('https://referrer.com/')
      }
    })

    it('should merge with existing view entry from accumulated', async () => {
      const factory = urlContextsDecoratorFactory({
        findUrlContext: () => ({ url: 'https://example.com/', referrer: 'https://referrer.com/' }),
      })
      const decorator = factory.create({})
      const obs: Observation = { type: 'action', startTime: 0, data: {} }
      const accumulated = { view: { id: 'view-1', name: 'Home' } } as any
      const result = await decorator.decorate(obs, accumulated)
      expect(result.status).toBe('contributed')
      if (result.status === 'contributed') {
        expect((result.attributes as any).view.id).toBe('view-1')
        expect((result.attributes as any).view.name).toBe('Home')
        expect((result.attributes as any).view.url).toBe('https://example.com/')
        expect((result.attributes as any).view.referrer).toBe('https://referrer.com/')
      }
    })

    it('should discard when no url context is found', async () => {
      const factory = urlContextsDecoratorFactory({ findUrlContext: () => undefined })
      const decorator = factory.create({})
      const obs: Observation = { type: 'action', startTime: 0, data: {} }
      const result = await decorator.decorate(obs, {})
      expect(result.status).toBe('discarded')
    })

    it('should declare canDiscard: true', () => {
      const factory = urlContextsDecoratorFactory({ findUrlContext: () => undefined })
      expect(factory.capabilities.canDiscard).toBe(true)
    })

    it('should require view decorator to run before url', () => {
      const factory = urlContextsDecoratorFactory({ findUrlContext: () => undefined })
      expect(factory.requires).toContain('view')
    })
  })

  describe('assemble hook', () => {
    it('should add url properties from the history', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual(
        jasmine.objectContaining({
          view: {
            url: jasmine.any(String),
            referrer: jasmine.any(String),
          },
        })
      )
    })

    it('should discard the event if no URL', () => {
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBe(DISCARDED)
    })
  })
})
