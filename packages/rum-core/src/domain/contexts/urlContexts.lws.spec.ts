import { Observable, relativeToClocks } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import type { LocationChange } from '../../browser/locationChangeObservable'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent } from '../view/trackViews'
import { createHooks } from '../hooks'
import { startUrlContexts } from './urlContexts'

describe('urlContexts LWS compatibility', () => {
  it('should use the provided view url when global location is unavailable', () => {
    const lifeCycle = new LifeCycle()
    const hooks = createHooks()
    const locationChangeObservable = new Observable<LocationChange>()
    const originalLocation = window.location

    replaceMockable(originalLocation, undefined as unknown as Location)

    const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable)
    registerCleanupTask(() => {
      urlContexts.stop()
    })

    expect(() => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0),
        url: 'https://example.com/lightning/page/home',
      } as ViewCreatedEvent)
    }).not.toThrow()

    expect(urlContexts.findUrl()).toEqual({
      url: 'https://example.com/lightning/page/home',
      referrer: document.referrer,
    })
  })
})
