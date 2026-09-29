import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { display } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { replaceMockable, startMockTelemetry } from '@datadog/browser-core/test'
import { lazyLoadRecorder, importRecorder } from './lazyLoadRecorder'

describe('lazyLoadRecorder', () => {
  let displaySpy: Mock
  let telemetry: MockTelemetry

  beforeEach(() => {
    telemetry = startMockTelemetry()
    displaySpy = vi.spyOn(display, 'error')
  })

  it('should report a console error and metrics but no telemetry error if CSP blocks the module', async () => {
    const loadRecorderError = new Error('Dynamic import was blocked due to Content Security Policy')
    replaceMockable(importRecorder, () => Promise.reject(loadRecorderError))
    await lazyLoadRecorder()

    expect(displaySpy).toHaveBeenCalledWith(expect.stringContaining('Recorder failed to start'), loadRecorderError)
    expect(displaySpy).toHaveBeenCalledWith(expect.stringContaining('Please make sure CSP is correctly configured'))
    expect(await telemetry.getEvents()).toEqual([])
  })

  it('should report a console error and metrics but no telemetry error if importing fails for non-CSP reasons', async () => {
    const loadRecorderError = new Error('Dynamic import failed')
    replaceMockable(importRecorder, () => Promise.reject(loadRecorderError))
    await lazyLoadRecorder()

    expect(displaySpy).toHaveBeenCalledWith(expect.stringContaining('Recorder failed to start'), loadRecorderError)
    expect(await telemetry.getEvents()).toEqual([])
  })
})
