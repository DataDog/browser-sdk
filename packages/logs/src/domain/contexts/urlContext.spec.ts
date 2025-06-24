import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask, setupLocationObserver } from '@datadog/browser-core/test'
import { HookNames } from '@datadog/browser-core'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startUrlContextHistory, startUrlContexts, stopUrlContextHistory } from './urlContexts'

describe('startUrlContexts', () => {
  let changeLocation: (to: string) => void
  let clock: Clock
  let hooks: Hooks

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()
    const setupResult = setupLocationObserver('http://fake-url.com')
    spyOnProperty(document, 'referrer', 'get').and.returnValue('http://fake-referrer.com')
    changeLocation = setupResult.changeLocation
    startUrlContextHistory(setupResult.fakeLocation, setupResult.locationChangeObservable)
    startUrlContexts(hooks)

    registerCleanupTask(() => {
      stopUrlContextHistory()
    })
  })

  it('should return the initial url context', () => {
    const eventOne = hooks.triggerHook(HookNames.Assemble, { startTime: clock.relative(0) })

    expect(eventOne).toEqual({
      view: {
        url: 'http://fake-url.com/',
        referrer: 'http://fake-referrer.com',
      },
    })
  })

  it('should return the url context corresponding to the start time', () => {
    clock.tick(10)
    changeLocation('/foo')

    clock.tick(10)
    changeLocation('/bar')

    const eventOne = hooks.triggerHook(HookNames.Assemble, { startTime: clock.relative(15) })

    expect(eventOne).toEqual({
      view: {
        url: 'http://fake-url.com/foo',
        referrer: 'http://fake-referrer.com',
      },
    })

    const eventTwo = hooks.triggerHook(HookNames.Assemble, { startTime: clock.relative(25) })

    expect(eventTwo).toEqual({
      view: {
        url: 'http://fake-url.com/bar',
        referrer: 'http://fake-referrer.com',
      },
    })
  })
})
