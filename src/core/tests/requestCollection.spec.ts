import { expect } from 'chai'
import * as sinon from 'sinon'
import { FetchStub, FetchStubBuilder, FetchStubPromise } from '../../tests/specHelper'
import { Observable } from '../observable'
import { RequestDetails, trackFetch } from '../requestCollection'

describe('fetch tracker', () => {
  const FAKE_URL = 'http://fake-url/'
  let originalFetch: any
  let fetchStubBuilder: FetchStubBuilder
  let fetchStub: (input: RequestInfo, init?: RequestInit) => FetchStubPromise
  let notifySpy: sinon.SinonSpy

  beforeEach(() => {
    originalFetch = window.fetch
    const requestObservable = new Observable<RequestDetails>()
    notifySpy = sinon.spy(requestObservable, 'notify')
    fetchStubBuilder = new FetchStubBuilder(requestObservable)
    window.fetch = fetchStubBuilder.getStub()
    trackFetch(requestObservable)
    fetchStub = window.fetch as FetchStub
    window.onunhandledrejection = () => {
      throw new Error('unhandled rejected promise')
    }
  })

  afterEach(() => {
    window.fetch = originalFetch as any
    // tslint:disable-next-line:no-null-keyword
    window.onunhandledrejection = null
  })

  it('should track server error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error', url: FAKE_URL })

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).equal('fetch')
      expect(request.method).equal('GET')
      expect(request.url).equal(FAKE_URL)
      expect(request.status).equal(500)
      expect(request.response).equal('fetch error')
      done()
    })
  })

  it('should track refused fetch', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).equal('fetch')
      expect(request.method).equal('GET')
      expect(request.url).equal(FAKE_URL)
      expect(request.status).equal(0)
      expect(request.response).match(/Error: fetch error/)
      done()
    })
  })

  it('should track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 400, responseText: 'Not found', url: FAKE_URL })

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).equal('fetch')
      expect(request.method).equal('GET')
      expect(request.url).equal(FAKE_URL)
      expect(request.status).equal(400)
      expect(request.response).equal('Not found')
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

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      expect(requests[0].method).equal('GET')
      expect(requests[1].method).equal('GET')
      expect(requests[2].method).equal('PUT')
      expect(requests[3].method).equal('POST')
      expect(requests[4].method).equal('POST')
      expect(requests[5].method).equal('POST')
      done()
    })
  })

  it('should get url from input', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))
    fetchStub(new Request(FAKE_URL)).rejectWith(new Error('fetch error'))
    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      expect(requests[0].url).equal(FAKE_URL)
      expect(requests[1].url).equal(FAKE_URL)
      done()
    })
  })

  it('should keep promise resolved behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = sinon.spy()
    fetchStubPromise.then(spy)
    fetchStubPromise.resolveWith({ status: 500 })

    setTimeout(() => {
      expect(spy.called).equal(true)
      done()
    })
  })

  it('should keep promise rejected behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = sinon.spy()
    fetchStubPromise.catch(spy)
    fetchStubPromise.rejectWith(new Error('fetch error'))

    setTimeout(() => {
      expect(spy.called).equal(true)
      done()
    })
  })
})
