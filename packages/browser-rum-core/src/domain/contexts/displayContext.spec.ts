import type { RelativeTime } from '@openobserve/js-core/time'
import { createHook } from '@openobserve/js-core/assembly'
import type { AssembleHook, AssembleHookParams } from '../hooks'
import type { DisplayContext } from './displayContext'
import { startDisplayContext } from './displayContext'

describe('displayContext', () => {
  let displayContext: DisplayContext
  let requestAnimationFrameSpy: jasmine.Spy
  let hook: AssembleHook

  beforeEach(() => {
    hook = createHook()
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
            width: jasmine.any(Number),
            height: jasmine.any(Number),
          },
        },
      })
    })
  })
})
