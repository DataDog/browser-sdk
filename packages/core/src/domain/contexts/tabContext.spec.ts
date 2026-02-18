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
        _dd: jasmine.objectContaining({
          browser_tab_id: jasmine.stringMatching(UUID_PATTERN),
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

    expect(event1._dd.browser_tab_id).toBe(event2._dd.browser_tab_id)
  })

  it('should expose the tab ID via getTabId()', () => {
    const tabContext = startTabContext(hooks)

    expect(tabContext.getTabId()).toMatch(UUID_PATTERN)
  })

  it('should return the same tab ID from getTabId() and the hook', () => {
    const tabContext = startTabContext(hooks)

    const event = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(event._dd.browser_tab_id).toBe(tabContext.getTabId())
  })

  it('should persist the tab ID to sessionStorage', () => {
    const tabContext = startTabContext(hooks)

    expect(sessionStorage.getItem('_dd_tab_id')).toBe(tabContext.getTabId())
  })

  it('should reuse an existing tab ID from sessionStorage', () => {
    sessionStorage.setItem('_dd_tab_id', 'existing-tab-id')
    const tabContext = startTabContext(hooks)

    expect(tabContext.getTabId()).toBe('existing-tab-id')
  })

  it('should generate a new tab ID when sessionStorage.getItem throws', () => {
    spyOn(sessionStorage, 'getItem').and.throwError('SecurityError')
    const tabContext = startTabContext(hooks)

    expect(tabContext.getTabId()).toMatch(UUID_PATTERN)
  })

  it('should generate a new tab ID when sessionStorage.setItem throws', () => {
    spyOn(sessionStorage, 'getItem').and.returnValue(null)
    spyOn(sessionStorage, 'setItem').and.throwError('QuotaExceededError')

    const tabContext = startTabContext(hooks)

    expect(tabContext.getTabId()).toMatch(UUID_PATTERN)
  })
})
