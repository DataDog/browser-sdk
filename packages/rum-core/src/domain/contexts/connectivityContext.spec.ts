import { setNavigatorOnLine, setNavigatorConnection } from '@datadog/browser-core/test'
import { HookNames } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startConnectivityContext } from './connectivityContext'

describe('startConnectivityContext', () => {
  describe('assemble hook', () => {
    type NewType = Hooks

    let hooks: NewType

    beforeEach(() => {
      hooks = createHooks()
    })

    it('should set ci visibility context defined by Cypress global variables', () => {
      startConnectivityContext(hooks)
      setNavigatorOnLine(true)
      setNavigatorConnection({ effectiveType: '2g' })
      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

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
