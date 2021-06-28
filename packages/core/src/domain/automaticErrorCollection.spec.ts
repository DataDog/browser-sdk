import { ErrorHandling, ErrorSource, RawError } from '../tools/error'
import { Observable } from '../tools/observable'
import { FetchStub, FetchStubManager, isIE, SPEC_ENDPOINTS, stubFetch } from '../../test/specHelper'
import { includes } from '../tools/utils'
import {
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
  trackNetworkError,
} from './automaticErrorCollection'
import { Configuration } from './configuration'

/* eslint-disable no-console */
describe('console tracker', () => {
  let consoleErrorStub: jasmine.Spy
  let notifyError: jasmine.Spy
  const CONSOLE_CONTEXT = {
    source: ErrorSource.CONSOLE,
  }

  beforeEach(() => {
    consoleErrorStub = spyOn(console, 'error')
    notifyError = jasmine.createSpy('notifyError')
    const errorObservable = new Observable<RawError>()
    errorObservable.subscribe(notifyError)
    startConsoleTracking(errorObservable)
  })

  afterEach(() => {
    stopConsoleTracking()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')
    expect(consoleErrorStub).toHaveBeenCalledWith('foo', 'bar')
  })

  it('should notify error', () => {
    console.error('foo', 'bar')
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: foo bar',
      stack: undefined,
      handlingStack: jasmine.any(String),
      startClocks: jasmine.any(Object),
      handling: ErrorHandling.HANDLED,
    })
  })

  it('should generate a handling stack', () => {
    function triggerError() {
      console.error('foo', 'bar')
    }
    triggerError()
    const rawError = notifyError.calls.mostRecent().args[0] as RawError
    expect(rawError.handlingStack).toMatch(/^Error:\s+at triggerError (.|\n)*$/)
  })

  it('should stringify object parameters', () => {
    console.error('Hello', { foo: 'bar' })
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: Hello {\n  "foo": "bar"\n}',
      stack: undefined,
      handlingStack: jasmine.any(String),
      startClocks: jasmine.any(Object),
      handling: ErrorHandling.HANDLED,
    })
  })

  it('should format error instance', () => {
    console.error(new TypeError('hello'))
    expect((notifyError.calls.mostRecent().args[0] as RawError).message).toBe('console error: TypeError: hello')
  })

  it('should extract stack from first error', () => {
    console.error(new TypeError('foo'), new TypeError('bar'))
    const stack = (notifyError.calls.mostRecent().args[0] as RawError).stack
    if (!isIE()) {
      expect(stack).toMatch(/^TypeError: foo\s+at/)
    } else {
      expect(stack).toContain('TypeError: foo')
    }
  })
})
/* eslint-enable no-console */

describe('runtime error tracker', () => {
  const ERROR_MESSAGE = 'foo'
  let originalHandler: OnErrorEventHandler
  let notifyError: jasmine.Spy
  let onerrorSpy: jasmine.Spy

  beforeEach(() => {
    originalHandler = window.onerror
    onerrorSpy = jasmine.createSpy()
    window.onerror = onerrorSpy

    notifyError = jasmine.createSpy()
    const errorObservable = new Observable<RawError>()
    errorObservable.subscribe((e: RawError) => notifyError(e) as void)

    startRuntimeErrorTracking(errorObservable)
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    window.onerror = originalHandler
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(onerrorSpy.calls.mostRecent().args[0]).toMatch(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should notify error', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect((notifyError.calls.mostRecent().args[0] as RawError).message).toEqual(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should handle direct onerror calls with objects', (done) => {
    setTimeout(() => {
      window.onerror!({ foo: 'bar' } as any)
    }, 10)

    setTimeout(() => {
      const collectedError = notifyError.calls.mostRecent().args[0] as RawError
      expect(collectedError.message).toEqual('Uncaught {"foo":"bar"}')
      expect(collectedError.stack).toEqual('No stack, consider using an instance of Error')
      done()
    }, 100)
  })
})

describe('network error tracker', () => {
  let errorObservableSpy: jasmine.Spy
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let stopNetworkErrorTracking: () => void
  let enabledExperimentalFeatures: string[]
  const FAKE_URL = 'http://fake.com/'
  const DEFAULT_REQUEST = {
    duration: 10,
    method: 'GET',
    responseText: 'Server error',
    startTime: 0,
    status: 503,
    url: FAKE_URL,
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    enabledExperimentalFeatures = []

    const errorObservable = new Observable<RawError>()
    errorObservableSpy = spyOn(errorObservable, 'notify')
    const configuration = {
      requestErrorResponseLengthLimit: 32,
      isEnabled(featureFlag: string) {
        return includes(enabledExperimentalFeatures, featureFlag)
      },
      ...SPEC_ENDPOINTS,
    }

    fetchStubManager = stubFetch()
    ;({ stop: stopNetworkErrorTracking } = trackNetworkError(configuration as Configuration, errorObservable))
    fetchStub = window.fetch as FetchStub
  })

  afterEach(() => {
    fetchStubManager.reset()
    stopNetworkErrorTracking()
  })

  it('should track server error', (done) => {
    fetchStub(FAKE_URL).resolveWith(DEFAULT_REQUEST)

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalledWith({
        message: 'Fetch error GET http://fake.com/',
        resource: {
          method: 'GET',
          statusCode: 503,
          url: 'http://fake.com/',
        },
        source: 'network',
        stack: 'Server error',
        startClocks: jasmine.any(Object),
      })
      done()
    })
  })

  it('should not track intake error', (done) => {
    fetchStub('https://logs-intake.com/v1/input/send?foo=bar').resolveWith(DEFAULT_REQUEST)

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).not.toHaveBeenCalled()
      done()
    })
  })

  it('should track aborted requests ', (done) => {
    fetchStub(FAKE_URL).abort()

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      done()
    })
  })

  it('should track refused request', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 0 })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      done()
    })
  })

  it('should not track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 400 })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).not.toHaveBeenCalled()
      done()
    })
  })

  it('should not track successful request', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, status: 200 })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).not.toHaveBeenCalled()
      done()
    })
  })

  it('should add a default error response text', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, responseText: undefined })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Failed to load')
      done()
    })
  })

  it('should truncate error response text', (done) => {
    fetchStub(FAKE_URL).resolveWith({
      ...DEFAULT_REQUEST,
      responseText: 'Lorem ipsum dolor sit amet orci aliquam.',
    })

    fetchStubManager.whenAllComplete(() => {
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Lorem ipsum dolor sit amet orci ...')
      done()
    })
  })

  describe('feature "remove-network-errors" enabled', () => {
    beforeEach(() => {
      enabledExperimentalFeatures.push('remove-network-errors')
    })

    it('should not track aborted requests ', (done) => {
      fetchStub(FAKE_URL).abort()

      fetchStubManager.whenAllComplete(() => {
        expect(errorObservableSpy).not.toHaveBeenCalled()
        done()
      })
    })
  })
})
