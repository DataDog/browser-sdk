import { updateExperimentalFeatures, resetExperimentalFeatures } from '../domain/configuration'
import { listenerWithTelemetry } from './listenerWithTelemetry'
import type { Context } from './context'
import { noop } from './utils'

describe('listenerWithTelemetry', () => {
  let stubEvent
  let fooSpy: jasmine.Spy
  let telemetryCallbackSpy: jasmine.Spy
  let func: {
    foo: () => void
    telemetryCallback: (message: string, context?: Context | undefined) => void
  }

  beforeEach(() => {
    updateExperimentalFeatures(['log_untrusted_events'])
    func = {
      foo: noop,
      telemetryCallback: (_message: string, _context?: Context | undefined) => {
        // do nothing
      },
    }
    fooSpy = spyOn(func, 'foo')
    telemetryCallbackSpy = spyOn(func, 'telemetryCallback')
  })

  afterEach(() => {
    resetExperimentalFeatures()
    fooSpy.calls.reset()
    telemetryCallbackSpy.calls.reset()
  })

  it('should normally call callback if untrusted event', () => {
    stubEvent = { isTrusted: false } as Event
    listenerWithTelemetry(func.foo, 0)(stubEvent)
    expect(func.foo).toHaveBeenCalled()
  })

  it('should normally call callback if trusted event', () => {
    stubEvent = { isTrusted: true } as Event
    listenerWithTelemetry(func.foo, 0)(stubEvent)
    expect(func.foo).toHaveBeenCalled()
  })

  it('should only send telemetry if event is not trusted', () => {
    stubEvent = { type: 'someType', isTrusted: false } as Event
    listenerWithTelemetry(func.foo, 0, func.telemetryCallback)(stubEvent)
    expect(func.telemetryCallback).toHaveBeenCalledWith('Untrusted event', {
      eventType: stubEvent.type,
    })
  })

  it('should only send telemetry if counter less than 3', () => {
    stubEvent = { type: 'someType', isTrusted: false } as Event
    listenerWithTelemetry(func.foo, 3, func.telemetryCallback)(stubEvent)
    expect(func.telemetryCallback).not.toHaveBeenCalled()
    listenerWithTelemetry(func.foo, 2, func.telemetryCallback)(stubEvent)
    expect(func.telemetryCallback).toHaveBeenCalledWith('Untrusted event', {
      eventType: stubEvent.type,
    })
  })

  it('should only send telemetry if flag enabled', () => {
    resetExperimentalFeatures()
    stubEvent = { type: 'someType', isTrusted: false } as Event
    listenerWithTelemetry(func.foo, 0, func.telemetryCallback)(stubEvent)
    expect(func.telemetryCallback).not.toHaveBeenCalled()
  })
})
