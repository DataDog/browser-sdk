import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { FetchStub, FetchStubBuilder, FetchStubPromise, isAndroid } from '../../tests/specHelper'
import { StackTrace } from '../../tracekit/tracekit'
import { Configuration } from '../configuration'
import {
  ErrorMessage,
  formatStackTraceToContext,
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
  trackFetchError,
} from '../errorCollection'
import { Observable } from '../observable'
import { noop } from '../utils'

use(sinonChai)

describe('console tracker', () => {
  let consoleErrorStub: sinon.SinonStub
  let notifyError: sinon.SinonSpy

  beforeEach(() => {
    consoleErrorStub = sinon.stub(console, 'error')
    consoleErrorStub.returnsThis()
    notifyError = sinon.spy()
    const errorObservable = new Observable<ErrorMessage>()
    errorObservable.subscribe(notifyError)
    startConsoleTracking(errorObservable)
  })

  afterEach(() => {
    stopConsoleTracking()
    sinon.restore()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')
    expect(consoleErrorStub).to.have.been.calledWithExactly('foo', 'bar')
  })

  it('should notify error', () => {
    console.error('foo', 'bar')
    expect(notifyError).to.have.been.calledWithExactly({ message: 'foo bar' })
  })

  it('should stringify object parameters', () => {
    console.error('Hello', { foo: 'bar' })
    expect(notifyError).to.have.been.calledWithExactly({ message: 'Hello {\n  "foo": "bar"\n}' })
  })
})

describe('runtime error tracker', () => {
  const ERROR_MESSAGE = 'foo'
  let mochaHandler: ErrorEventHandler
  let notifyError: sinon.SinonSpy
  let onerrorSpy: sinon.SinonSpy

  beforeEach(function() {
    if (isAndroid()) {
      this.skip()
    }
    mochaHandler = window.onerror
    onerrorSpy = sinon.spy(noop)
    window.onerror = onerrorSpy

    notifyError = sinon.spy()
    const errorObservable = new Observable<ErrorMessage>()
    // ensure that we call mocha handler for unexpected errors
    errorObservable.subscribe((e: ErrorMessage) =>
      e.message !== ERROR_MESSAGE ? mochaHandler(e.message) : notifyError(e)
    )

    startRuntimeErrorTracking(errorObservable)
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    sinon.restore()
    window.onerror = mochaHandler
  })

  it('should notify error', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(notifyError.getCall(0).args[0].message).to.equal(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(onerrorSpy).to.have.been.calledWithMatch(sinon.match(ERROR_MESSAGE))
      done()
    }, 100)
  })

  it('should format the error with right context', () => {
    const stack: StackTrace = {
      message: 'oh snap!',
      name: 'TypeError',
      stack: [
        {
          args: ['1', 'bar'],
          column: 15,
          func: 'foo',
          line: 52,
          url: 'http://path/to/file.js',
        },
        {
          args: [],
          column: undefined,
          func: '?',
          line: 12,
          url: 'http://path/to/file.js',
        },
        {
          args: ['baz'],
          column: undefined,
          func: '?',
          line: undefined,
          url: 'http://path/to/file.js',
        },
      ],
    }

    const context = formatStackTraceToContext(stack)

    expect(context.error.kind).eq('TypeError')
    expect(context.error.stack).eq(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
  })
})

describe('fetch error tracker', () => {
  const FAKE_URL = 'http://fake-url/'
  let originalFetch: any
  let fetchStubBuilder: FetchStubBuilder
  let fetchStub: (input: RequestInfo, init?: RequestInit) => FetchStubPromise
  let notifySpy: sinon.SinonSpy

  beforeEach(() => {
    originalFetch = window.fetch
    const errorObservable = new Observable<ErrorMessage>()
    notifySpy = sinon.spy(errorObservable, 'notify')
    fetchStubBuilder = new FetchStubBuilder(errorObservable)
    window.fetch = fetchStubBuilder.getStub()
    const configuration = { requestErrorResponseLengthLimit: 32 }
    trackFetchError(configuration as Configuration, errorObservable)
    fetchStub = window.fetch as FetchStub
    window.onunhandledrejection = () => {
      throw new Error('unhandled rejected promise')
    }
  })

  afterEach(() => {
    window.fetch = originalFetch
    // tslint:disable-next-line:no-null-keyword
    window.onunhandledrejection = null
  })

  it('should track server error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error', url: FAKE_URL })

    fetchStubBuilder.whenAllComplete((messages: ErrorMessage[]) => {
      expect(messages[0].message).to.equal('Fetch error GET http://fake-url/')
      expect(messages[0].context.http).to.deep.equal({
        method: 'GET',
        status_code: 500,
        url: FAKE_URL,
      })
      expect(messages[0].context.error.stack).to.equal('fetch error')
      done()
    })
  })

  it('should track refused fetch', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))

    fetchStubBuilder.whenAllComplete((messages: ErrorMessage[]) => {
      expect(messages[0].message).to.equal('Fetch error GET http://fake-url/')
      expect(messages[0].context.http).to.deep.equal({
        method: 'GET',
        status_code: 0,
        url: FAKE_URL,
      })
      expect(messages[0].context.error.stack).to.match(/Error: fetch error/)
      done()
    })
  })

  it('should not track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 400 })

    setTimeout(() => {
      expect(notifySpy.called).to.equal(false)
      done()
    })
  })

  it('should get method from input', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL)).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL, { method: 'PUT' })).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL, { method: 'PUT' }), { method: 'POST' }).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL), { method: 'POST' }).resolveWith({ status: 500 })
    fetchStub(FAKE_URL, { method: 'POST' }).resolveWith({ status: 500 })

    fetchStubBuilder.whenAllComplete((messages: ErrorMessage[]) => {
      expect(messages[0].context.http.method).to.equal('GET')
      expect(messages[1].context.http.method).to.equal('GET')
      expect(messages[2].context.http.method).to.equal('PUT')
      expect(messages[3].context.http.method).to.equal('POST')
      expect(messages[4].context.http.method).to.equal('POST')
      expect(messages[5].context.http.method).to.equal('POST')
      done()
    })
  })

  it('should get url from input', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))
    fetchStub(new Request(FAKE_URL)).rejectWith(new Error('fetch error'))
    fetchStubBuilder.whenAllComplete((messages: ErrorMessage[]) => {
      expect(messages[0].context.http.url).to.equal(FAKE_URL)
      expect(messages[1].context.http.url).to.equal(FAKE_URL)
      done()
    })
  })

  it('should add a default error response', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500 })

    fetchStubBuilder.whenAllComplete((messages: ErrorMessage[]) => {
      expect(messages[0].context.error.stack).to.equal('Failed to load')
      done()
    })
  })

  it('should truncate error response', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'Lorem ipsum dolor sit amet orci aliquam.' })

    fetchStubBuilder.whenAllComplete((messages: ErrorMessage[]) => {
      expect(messages[0].context.error.stack).to.equal('Lorem ipsum dolor sit amet orci ...')
      done()
    })
  })

  it('should keep promise resolved behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = sinon.spy()
    fetchStubPromise.then(spy)
    fetchStubPromise.resolveWith({ status: 500 })

    setTimeout(() => {
      expect(spy.called).to.equal(true)
      done()
    })
  })

  it('should keep promise rejected behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = sinon.spy()
    fetchStubPromise.catch(spy)
    fetchStubPromise.rejectWith(new Error('fetch error'))

    setTimeout(() => {
      expect(spy.called).to.equal(true)
      done()
    })
  })
})
