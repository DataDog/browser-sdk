import { afterEach, vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { RelativeTime } from '@datadog/js-core/time'
import { createHook } from '@datadog/browser-core'
import type { AssembleHook, AssembleHookParams } from '../hooks'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let displayContext: DisplayContext
  let requestAnimationFrameSpy: Mock
  let hook: AssembleHook

  beforeEach(() => {
    hook = createHook()
    requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(1)
      return 1
    })
  })

  afterEach(() => {
    displayContext.stop()
  })

  describe('assemble hook', () => {
    it('should set the display context', () => {
      displayContext = startDisplayContext(hook)

      const event = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)
      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)

      expect(event).toEqual({
        type: 'view',
        display: {
          viewport: {
            width: expect.any(Number),
            height: expect.any(Number),
          },
        },
      })
    })
  })
})
