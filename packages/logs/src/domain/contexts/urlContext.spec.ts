import { HookNames } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { cacheUrlContext, clearCachedUrlContext, startUrlContexts } from './urlContexts'

describe('startUrlContexts', () => {
  let hooks: Hooks
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()

    const referrerSpy = spyOnProperty(document, 'referrer', 'get').and.returnValue('http://buffered-referrer.com')
    cacheUrlContext({ href: 'http://buffered-url.com' } as Location)

    referrerSpy.and.returnValue('http://current-referrer.com')
    startUrlContexts(hooks, { href: 'http://current-url.com' } as Location)
  })

  afterEach(() => {
    clearCachedUrlContext()
  })

  it('returns buffered url context when event is before the start time', () => {
    const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: clock.relative(-1),
    })

    expect(defaultLogsEventAttributes).toEqual({
      view: {
        url: 'http://buffered-url.com',
        referrer: 'http://buffered-referrer.com',
      },
    })
  })

  it('returns current url context when event is after the start time', () => {
    const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: clock.relative(1),
    })

    expect(defaultLogsEventAttributes).toEqual({
      view: {
        url: 'http://current-url.com',
        referrer: 'http://current-referrer.com',
      },
    })
  })
})
