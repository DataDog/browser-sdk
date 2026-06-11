import { vi, beforeEach, describe, expect, it } from 'vitest'
import type { RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '../../../test'
import type { Hook } from '../../tools/abstractHooks'
import { createHook } from '../../tools/abstractHooks'
import { TAB_ID_STORAGE_KEY, resetCachedTabId, startTabContext } from './tabContext'

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

describe('tabContext', () => {
  let hook: Hook<any, any>

  beforeEach(() => {
    resetCachedTabId()
    hook = createHook()
    registerCleanupTask(() => {
      sessionStorage.removeItem(TAB_ID_STORAGE_KEY)
      resetCachedTabId()
    })
  })

  it('should return a tab ID via the assemble hook', () => {
    startTabContext(hook)

    const event = hook.trigger({
      startTime: 0 as RelativeTime,
    })

    expect(event).toEqual(
      expect.objectContaining({
        tab: expect.objectContaining({
          id: expect.stringMatching(UUID_PATTERN),
        }),
      })
    )
  })

  it('should return a consistent tab ID across multiple hook triggers', () => {
    startTabContext(hook)

    const event1 = hook.trigger({ startTime: 0 as RelativeTime })
    const event2 = hook.trigger({ startTime: 0 as RelativeTime })

    expect(event1.tab.id).toBe(event2.tab.id)
  })

  it('should persist the tab ID to sessionStorage', () => {
    startTabContext(hook)

    const event = hook.trigger({ startTime: 0 as RelativeTime })

    expect(sessionStorage.getItem(TAB_ID_STORAGE_KEY)).toBe(event.tab.id)
  })

  it('should reuse an existing tab ID from sessionStorage', () => {
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, 'existing-tab-id')
    startTabContext(hook)

    const event = hook.trigger({ startTime: 0 as RelativeTime })

    expect(event.tab.id).toBe('existing-tab-id')
  })

  it('should generate a tab ID when sessionStorage.getItem throws', () => {
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    startTabContext(hook)

    const event = hook.trigger({ startTime: 0 as RelativeTime })

    expect(event.tab.id).toMatch(UUID_PATTERN)
  })

  it('should generate a tab ID when sessionStorage.setItem throws', () => {
    vi.spyOn(sessionStorage, 'getItem').mockReturnValue(null)
    vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    startTabContext(hook)

    const event = hook.trigger({ startTime: 0 as RelativeTime })

    expect(event.tab.id).toMatch(UUID_PATTERN)
  })

  it('should return the same tab ID across multiple startTabContext calls when sessionStorage is unavailable', () => {
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    const hook1 = createHook<any, any>()
    startTabContext(hook1)
    const hook2 = createHook<any, any>()
    startTabContext(hook2)

    const event1 = hook1.trigger({ startTime: 0 as RelativeTime })
    const event2 = hook2.trigger({ startTime: 0 as RelativeTime })

    expect(event1.tab.id).toBe(event2.tab.id)
  })
})
