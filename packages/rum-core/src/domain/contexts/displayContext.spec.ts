import { HookNames } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let displayContext: DisplayContext
  let requestAnimationFrameSpy: jasmine.Spy
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    requestAnimationFrameSpy = spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
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

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })
      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)

      expect(event).toEqual({
        type: 'view',
        display: {
          viewport: {
            width: jasmine.any(Number),
            height: jasmine.any(Number),
          },
        },
      })
    })
  })
})
