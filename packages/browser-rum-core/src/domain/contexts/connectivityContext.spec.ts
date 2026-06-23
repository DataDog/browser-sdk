import { setNavigatorOnLine, setNavigatorConnection } from '@openobserve/browser-core/test'
import type { RelativeTime } from '@openobserve/js-core/time'
import { createHook } from '@openobserve/js-core/assembly'
import type { AssembleHook, AssembleHookParams } from '../hooks'
import { startConnectivityContext } from './connectivityContext'

describe('startConnectivityContext', () => {
  describe('assemble hook', () => {
    let hook: AssembleHook

    beforeEach(() => {
      hook = createHook()
    })

    it('should set ci visibility context defined by Cypress global variables', () => {
      startConnectivityContext(hook)
      setNavigatorOnLine(true)
      setNavigatorConnection({ effectiveType: '2g' })
      const event = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(event).toEqual({
        type: 'view',
        connectivity: {
          status: 'connected',
          effective_type: '2g',
          interfaces: undefined,
        },
      })
    })
  })
})
