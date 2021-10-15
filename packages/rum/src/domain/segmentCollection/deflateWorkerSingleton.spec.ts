import {
  display,
  MonitoringMessage,
  noop,
  resetInternalMonitoring,
  setDebugMode,
  startFakeInternalMonitoring,
} from '@datadog/browser-core'
import { MockWorker } from '../../../test/utils'
import { createDeflateWorker } from './deflateWorker'
import { loadDeflateWorkerSingleton, resetDeflateWorkerSingletonState } from './deflateWorkerSingleton'

describe('loadDeflateWorkerSingleton', () => {
  let deflateWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<typeof createDeflateWorker>

  beforeEach(() => {
    resetDeflateWorkerSingletonState()
    deflateWorker = new MockWorker()
    createDeflateWorkerSpy = jasmine.createSpy().and.callFake(() => deflateWorker)
    setDebugMode(true)
  })

  afterEach(() => {
    resetDeflateWorkerSingletonState()
  })

  it('creates a deflate worker', () => {
    const callbackSpy = jasmine.createSpy()
    loadDeflateWorkerSingleton(callbackSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    deflateWorker.processAllMessages()
    expect(callbackSpy).toHaveBeenCalledOnceWith(deflateWorker)
  })

  it('returns the previously created worker', () => {
    loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
    deflateWorker.processAllMessages()

    const callbackSpy = jasmine.createSpy()
    loadDeflateWorkerSingleton(callbackSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    deflateWorker.processAllMessages()
    expect(callbackSpy).toHaveBeenCalledOnceWith(deflateWorker)
  })

  describe('loading state', () => {
    it('does not create multiple workers when called multiple times while the worker is loading', () => {
      loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
      loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
      expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    })

    it('calls all registered callbacks when the worker is loaded', () => {
      const callbackSpy1 = jasmine.createSpy()
      const callbackSpy2 = jasmine.createSpy()
      loadDeflateWorkerSingleton(callbackSpy1, createDeflateWorkerSpy)
      loadDeflateWorkerSingleton(callbackSpy2, createDeflateWorkerSpy)
      deflateWorker.processAllMessages()
      expect(callbackSpy1).toHaveBeenCalledOnceWith(deflateWorker)
      expect(callbackSpy2).toHaveBeenCalledOnceWith(deflateWorker)
    })
  })

  describe('error state', () => {
    let internalMonitoringMessages: MonitoringMessage[]
    const UNKNOWN_ERROR = new Error('boom')
    // mimic Chrome behavior
    const CSP_ERROR = new DOMException(
      "Failed to construct 'Worker': Access to the script at 'blob:https://example.org/9aadbb61-effe-41ee-aa76-fc607053d642' is denied by the document's Content Security Policy."
    )
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      internalMonitoringMessages = startFakeInternalMonitoring()
    })

    afterEach(() => {
      resetInternalMonitoring()
    })

    it('displays an error message when the worker creation throws an unknown error', () => {
      loadDeflateWorkerSingleton(noop, () => {
        throw UNKNOWN_ERROR
      })
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Session Replay recording failed to start: an error occurred while creating the Worker:',
        UNKNOWN_ERROR
      )
    })

    it('reports unknown errors to internal monitoring', () => {
      loadDeflateWorkerSingleton(noop, () => {
        throw UNKNOWN_ERROR
      })
      expect(internalMonitoringMessages).toEqual([
        { status: 'error' as any, message: 'boom', error: { kind: 'Error', stack: jasmine.any(String) } },
      ])
    })

    it('displays CSP instructions when the worker creation throws a CSP error', () => {
      loadDeflateWorkerSingleton(noop, () => {
        throw CSP_ERROR
      })
      expect(displaySpy).toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('does not report CSP errors to internal monitoring', () => {
      loadDeflateWorkerSingleton(noop, () => {
        throw CSP_ERROR
      })
      expect(internalMonitoringMessages).toEqual([])
    })

    it('displays ErrorEvent as CSP error', () => {
      loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(displaySpy).toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('does not display error messages as CSP error', () => {
      loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorMessage('foo')
      expect(displaySpy).not.toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('calls the callback without argument in case of an error occurs during loading', () => {
      const callbackSpy = jasmine.createSpy()
      loadDeflateWorkerSingleton(callbackSpy, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(callbackSpy).toHaveBeenCalledOnceWith()
    })

    it('calls the callback without argument in case of an error occurred in a previous loading', () => {
      loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()

      const callbackSpy = jasmine.createSpy()
      loadDeflateWorkerSingleton(callbackSpy, createDeflateWorkerSpy)
      expect(callbackSpy).toHaveBeenCalledOnceWith()
    })

    it('reports errors occurring after loading to internal monitoring', () => {
      loadDeflateWorkerSingleton(noop, createDeflateWorkerSpy)
      deflateWorker.processAllMessages()

      deflateWorker.dispatchErrorMessage('boom')
      expect(internalMonitoringMessages).toEqual([
        { status: 'error' as any, message: 'Uncaught "boom"', error: { stack: jasmine.any(String) } },
      ])
    })
  })
})
