import { vi, type Mock } from 'vitest'
import { HookNames } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let displayContext: DisplayContext
  let requestAnimationFrameSpy: Mock
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
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
      displayContext = startDisplayContext(hooks, mockRumConfiguration())

      const event = hooks.triggerHook(HookNames.Assemble, {
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
