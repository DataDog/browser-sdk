import { display } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { replaceMockable, startMockTelemetry } from '@datadog/browser-core/test'
import { lazyLoadDeflateWorker, importDeflateWorker } from './lazyLoadDeflateWorker'

describe('lazyLoadDeflateWorker', () => {
  let displaySpy: jasmine.Spy
  let telemetry: MockTelemetry

  beforeEach(() => {
    telemetry = startMockTelemetry()
    displaySpy = spyOn(display, 'error')
  })

  it('should report a console error but no telemetry error if CSP blocks the module', async () => {
    const error = new Error('Dynamic import was blocked due to Content Security Policy')
    replaceMockable(importDeflateWorker, () => Promise.reject(error))
    const module = await lazyLoadDeflateWorker()

    expect(module).toBeUndefined()
    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Deflate worker failed to start'), error)
    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Please make sure CSP is correctly configured'))
    expect(await telemetry.getEvents()).toEqual([])
  })

  it('should report a console error but no telemetry error if importing fails for non-CSP reasons', async () => {
    const error = new Error('Dynamic import failed')
    replaceMockable(importDeflateWorker, () => Promise.reject(error))
    const module = await lazyLoadDeflateWorker()

    expect(module).toBeUndefined()
    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Deflate worker failed to start'), error)
    expect(await telemetry.getEvents()).toEqual([])
  })
})
