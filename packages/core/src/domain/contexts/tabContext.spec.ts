import type { Hooks } from '../../../test'
import { createHooks, registerCleanupTask } from '../../../test'
import { HookNames } from '../../tools/abstractHooks'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { startTabContext } from './tabContext'

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

describe('tabContext', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    registerCleanupTask(() => {
      sessionStorage.removeItem('_dd_tab_id')
    })
  })

  it('should return a tab ID via the assemble hook', () => {
    startTabContext(hooks)

    const event = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(event).toEqual(
      jasmine.objectContaining({
        tab: jasmine.objectContaining({
          id: jasmine.stringMatching(UUID_PATTERN),
        }),
      })
    )
  })

  it('should return a consistent tab ID across multiple hook triggers', () => {
    startTabContext(hooks)

    const event1 = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })
    const event2 = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(event1.tab.id).toBe(event2.tab.id)
  })

  it('should persist the tab ID to sessionStorage', () => {
    startTabContext(hooks)

    const event = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(sessionStorage.getItem('_dd_tab_id')).toBe(event.tab.id)
  })

  it('should reuse an existing tab ID from sessionStorage', () => {
    sessionStorage.setItem('_dd_tab_id', 'existing-tab-id')
    startTabContext(hooks)

    const event = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(event.tab.id).toBe('existing-tab-id')
  })

  it('should generate a tab ID when sessionStorage.getItem throws', () => {
    spyOn(sessionStorage, 'getItem').and.throwError('SecurityError')
    startTabContext(hooks)

    const event = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(event.tab.id).toMatch(UUID_PATTERN)
  })

  it('should generate a tab ID when sessionStorage.setItem throws', () => {
    spyOn(sessionStorage, 'getItem').and.returnValue(null)
    spyOn(sessionStorage, 'setItem').and.throwError('QuotaExceededError')
    startTabContext(hooks)

    const event = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(event.tab.id).toMatch(UUID_PATTERN)
  })

  it('should return the same tab ID across multiple startTabContext calls when sessionStorage is unavailable', () => {
    spyOn(sessionStorage, 'getItem').and.throwError('SecurityError')

    const hooks1 = createHooks()
    startTabContext(hooks1)
    const hooks2 = createHooks()
    startTabContext(hooks2)

    const event1 = hooks1.triggerHook(HookNames.Assemble, { startTime: 0 as RelativeTime })
    const event2 = hooks2.triggerHook(HookNames.Assemble, { startTime: 0 as RelativeTime })

    expect(event1.tab.id).toBe(event2.tab.id)
  })
})
