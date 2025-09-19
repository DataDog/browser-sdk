import type { RelativeTime } from '@datadog/browser-core'
import { HookNames } from '@datadog/browser-core'
import { mockSyntheticsWorkerValues } from '@datadog/browser-core/test'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startRUMInternalContext } from './rumInternalContext'

describe('startRUMInternalContext', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    startRUMInternalContext(hooks)
  })

  afterEach(() => {
    delete window.DD_RUM
    delete window.DD_RUM_SYNTHETICS
  })

  describe('assemble hook', () => {
    it('returns undefined if no RUM instance is present', () => {
      const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogsEventAttributes).toBeUndefined()
    })

    it('returns undefined if the global variable does not have a `getInternalContext` method', () => {
      window.DD_RUM = {} as any
      const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })
      expect(defaultLogsEventAttributes).toBeUndefined()
    })

    it('returns the internal context from the `getInternalContext` method', () => {
      window.DD_RUM = {
        getInternalContext: () => ({ foo: 'bar' }),
      }
      const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })
      expect(defaultLogsEventAttributes).toEqual({ foo: 'bar' })
    })

    describe('when RUM is injected by Synthetics', () => {
      beforeEach(() => {
        mockSyntheticsWorkerValues({ injectsRum: true, publicId: 'test-id', resultId: 'result-id' })
      })

      it('uses the global variable created when the synthetics worker is injecting RUM', () => {
        window.DD_RUM_SYNTHETICS = {
          getInternalContext: () => ({ foo: 'bar' }),
        }
        const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          startTime: 0 as RelativeTime,
        })
        expect(defaultLogsEventAttributes).toEqual({ foo: 'bar' })
      })
    })
  })

  describe('assemble telemetry hook', () => {
    it('should set internal context', () => {
      window.DD_RUM = {
        getInternalContext: () => ({ application_id: '123', view: { id: '456' }, user_action: { id: '789' } }),
      }
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
        application: { id: '123' },
        view: { id: '456' },
        action: { id: '789' },
      })
    })

    it('should not set internal context if the RUM instance is not present', () => {
      window.DD_RUM = {
        getInternalContext: () => undefined,
      }
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual(undefined)
    })
  })
})
