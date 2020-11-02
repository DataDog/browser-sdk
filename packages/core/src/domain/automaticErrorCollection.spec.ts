import { ErrorSource, RawError } from '../tools/error'
import { Observable } from '../tools/observable'
import { FetchStub, FetchStubManager, isIE, SPEC_ENDPOINTS, stubFetch } from '../tools/specHelper'
import { ONE_MINUTE } from '../tools/utils'
import {
  filterErrors,
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
  trackNetworkError,
} from './automaticErrorCollection'
import { Configuration } from './configuration'

describe('console tracker', () => {
  let consoleErrorStub: jasmine.Spy
  let notifyError: jasmine.Spy
  const CONSOLE_CONTEXT = {
    source: ErrorSource.CONSOLE,
  }

  beforeEach(() => {
    consoleErrorStub = spyOn(console, 'error')
    notifyError = jasmine.createSpy()
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
      startTime: jasmine.any(Number),
    })
  })

  it('should stringify object parameters', () => {
    console.error('Hello', { foo: 'bar' })
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: Hello {\n  "foo": "bar"\n}',
      startTime: jasmine.any(Number),
    })
  })

  it('should format error instance', () => {
    console.error(new TypeError('hello'))
    expect((notifyError.calls.mostRecent().args[0] as RawError).message).toContain('console error: TypeError: hello')
  })
})

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
})

describe('network error tracker', () => {
  let errorObservableSpy: jasmine.Spy
  let fetchStub: FetchStub
  let fetchStubManager: FetchStubManager
  let stopNetworkErrorTracking: () => void
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
    const errorObservable = new Observable<RawError>()
    errorObservableSpy = spyOn(errorObservable, 'notify')
    const configuration = { requestErrorResponseLengthLimit: 32, ...SPEC_ENDPOINTS }

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
        startTime: jasmine.any(Number),
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

  it('should add a default error response', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, responseText: undefined })

    fetchStubManager.whenAllComplete(() => {
      expect(errorObservableSpy).toHaveBeenCalled()
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Failed to load')
      done()
    })
  })

  it('should truncate error response', (done) => {
    fetchStub(FAKE_URL).resolveWith({ ...DEFAULT_REQUEST, responseText: 'Lorem ipsum dolor sit amet orci aliquam.' })

    fetchStubManager.whenAllComplete(() => {
      const stack = (errorObservableSpy.calls.mostRecent().args[0] as RawError).stack
      expect(stack).toEqual('Lorem ipsum dolor sit amet orci ...')
      done()
    })
  })
})

describe('error limitation', () => {
  let errorObservable: Observable<RawError>
  let filteredSubscriber: jasmine.Spy
  const CONTEXT = {
    source: ErrorSource.SOURCE,
    startTime: 100,
  }

  beforeEach(() => {
    errorObservable = new Observable<RawError>()
    const configuration: Partial<Configuration> = { maxErrorsByMinute: 2 }
    jasmine.clock().install()
    const filteredErrorObservable = filterErrors(configuration as Configuration, errorObservable)
    filteredSubscriber = jasmine.createSpy()
    filteredErrorObservable.subscribe(filteredSubscriber)
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  it('should stop send errors if threshold is exceeded', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })

    expect(filteredSubscriber).toHaveBeenCalledWith({ message: '1', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledWith({ message: '2', ...CONTEXT })
    expect(filteredSubscriber).not.toHaveBeenCalledWith({ message: '3', ...CONTEXT })
  })

  it('should send a threshold reached message', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })

    expect(filteredSubscriber).toHaveBeenCalledWith({
      message: 'Reached max number of errors by minute: 2',
      source: ErrorSource.AGENT,
      startTime: jasmine.any(Number),
    })
  })

  it('should reset error count every each minute', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })
    errorObservable.notify({ message: '4', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(3)

    jasmine.clock().tick(ONE_MINUTE - 1)

    errorObservable.notify({ message: '5', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(3)

    jasmine.clock().tick(1)

    errorObservable.notify({ message: '6', ...CONTEXT })
    errorObservable.notify({ message: '7', ...CONTEXT })
    errorObservable.notify({ message: '8', ...CONTEXT })
    errorObservable.notify({ message: '9', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(6)

    jasmine.clock().tick(ONE_MINUTE)

    errorObservable.notify({ message: '10', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(7)
  })
})
