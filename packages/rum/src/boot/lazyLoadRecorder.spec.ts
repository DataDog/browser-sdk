import { display } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { startMockTelemetry } from '@datadog/browser-core/test'
import { lazyLoadRecorder } from './lazyLoadRecorder'

describe('lazyLoadRecorder', () => {
  let displaySpy: jasmine.Spy
  let telemetry: MockTelemetry

  beforeEach(() => {
    telemetry = startMockTelemetry()
    displaySpy = spyOn(display, 'error')
  })

  it('should report a console error and metrics but no telemetry error if CSP blocks the module', async () => {
    const loadRecorderError = new Error('Dynamic import was blocked due to Content Security Policy')
    await lazyLoadRecorder(() => Promise.reject(loadRecorderError))

    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Recorder failed to start'), loadRecorderError)
    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Please make sure CSP is correctly configured'))
    expect(await telemetry.getEvents()).toEqual([])
  })

  it('should report a console error and metrics but no telemetry error if importing fails for non-CSP reasons', async () => {
    const loadRecorderError = new Error('Dynamic import failed')
    await lazyLoadRecorder(() => Promise.reject(loadRecorderError))

    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Recorder failed to start'), loadRecorderError)
    expect(await telemetry.getEvents()).toEqual([])
  })
})
