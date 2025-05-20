import type { RawTelemetryEvent } from '@datadog/browser-core'
import { startFakeTelemetry } from '@datadog/browser-core'
import { mockSyntheticsWorkerValues } from '@datadog/browser-core/test'
import { resetRUMInternalContext, getRUMInternalContext } from './rumInternalContext'

describe('getRUMInternalContext', () => {
  afterEach(() => {
    delete window.DD_RUM
    delete window.DD_RUM_SYNTHETICS
    resetRUMInternalContext()
  })

  it('returns undefined if no RUM instance is present', () => {
    expect(getRUMInternalContext()).toBeUndefined()
  })

  it('returns undefined if the global variable does not have a `getInternalContext` method', () => {
    window.DD_RUM = {} as any
    expect(getRUMInternalContext()).toBeUndefined()
  })

  it('returns the internal context from the `getInternalContext` method', () => {
    window.DD_RUM = {
      getInternalContext: () => ({ foo: 'bar' }),
    }
    expect(getRUMInternalContext()).toEqual({ foo: 'bar' })
  })

  describe('when RUM is injected by Synthetics', () => {
    let telemetryEvents: RawTelemetryEvent[]

    beforeEach(() => {
      mockSyntheticsWorkerValues({ injectsRum: true, publicId: 'test-id', resultId: 'result-id' })
      telemetryEvents = startFakeTelemetry()
    })

    it('uses the global variable created when the synthetics worker is injecting RUM', () => {
      window.DD_RUM_SYNTHETICS = {
        getInternalContext: () => ({ foo: 'bar' }),
      }
      expect(getRUMInternalContext()).toEqual({ foo: 'bar' })
    })

    it('adds a telemetry debug event when RUM has not been injected yet', () => {
      getRUMInternalContext()
      expect(telemetryEvents[0]).toEqual(
        jasmine.objectContaining({
          message: 'Logs sent before RUM is injected by the synthetics worker',
          status: 'debug',
          type: 'log',
          testId: 'test-id',
          resultId: 'result-id',
        })
      )
    })

    it('adds the telemetry debug event only once', () => {
      getRUMInternalContext()
      getRUMInternalContext()
      expect(telemetryEvents.length).toEqual(1)
    })
  })
})
