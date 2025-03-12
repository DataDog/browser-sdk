import type { EndpointBuilder } from '../src'
import { INTAKE_URL_PARAMETERS, noop } from '../src'
import { mockXhr, MockXhr } from './emulate/mockXhr'
import { registerCleanupTask } from './registerCleanupTask'

const INTAKE_PARAMS = INTAKE_URL_PARAMETERS.join('&')

export const DEFAULT_FETCH_MOCK = () => Promise.resolve({ status: 200, type: 'cors' })
export const TOO_MANY_REQUESTS_FETCH_MOCK = () => Promise.resolve({ status: 429, type: 'cors' })
export const NETWORK_ERROR_FETCH_MOCK = () => Promise.reject(new Error('Network request failed'))

export const SPEC_ENDPOINTS = {
  logsEndpointBuilder: mockEndpointBuilder(`https://mock.com/abcde?${INTAKE_PARAMS}`),
  rumEndpointBuilder: mockEndpointBuilder(`https://mock.com/abcde?${INTAKE_PARAMS}`),
}

export function mockEndpointBuilder(url: string) {
  return { build: (..._: any) => url } as EndpointBuilder
}

export interface Request {
  type: 'sendBeacon' | 'fetch' | 'fetch-keepalive' // TODO remove xhr
  url: string
  body: string
}

export function interceptRequests() {
  const requests: Request[] = []
  const originalSendBeacon = isSendBeaconSupported() && navigator.sendBeacon.bind(navigator)
  const originalRequest = window.Request
  const originalFetch = window.fetch

  if (isSendBeaconSupported()) {
    spyOn(navigator, 'sendBeacon').and.callFake((url, body) => {
      requests.push({ type: 'sendBeacon', url: url as string, body: body as string })
      return true
    })
  }

  let fetchMocks: Array<() => Promise<unknown>> = [DEFAULT_FETCH_MOCK]

  let resolveFetchCallReturns: (() => void) | undefined
  const endAllPromises = new Promise<void>((resolve) => {
    resolveFetchCallReturns = resolve
  })

  const fetchSpy = spyOn(window, 'fetch').and.callFake((url, config) => {
    const fetchPromise = fetchMocks.shift()

    if (!fetchPromise) {
      throw new Error('No fetch mock provided')
    }

    return fetchPromise()
      .then((response) => {
        requests.push({
          type: config?.keepalive ? 'fetch-keepalive' : 'fetch',
          url: url as string,
          body: config!.body as string,
        })

        return response as Response
      })
      .finally(() => {
        if (fetchMocks.length === 0) {
          resolveFetchCallReturns?.()
        }
      })
  })

  function isSendBeaconSupported() {
    return !!navigator.sendBeacon
  }

  function isFetchKeepAliveSupported() {
    return window.Request && 'keepalive' in new window.Request('')
  }

  registerCleanupTask(() => {
    if (originalSendBeacon) {
      navigator.sendBeacon = originalSendBeacon
    }
    if (originalRequest) {
      window.Request = originalRequest
    }
    if (originalFetch) {
      window.fetch = originalFetch
    }
    MockXhr.onSend = noop
  })

  return {
    requests,
    isSendBeaconSupported,
    isFetchKeepAliveSupported,
    waitForAllFetchCalls: () => endAllPromises,
    withSendBeacon(newSendBeacon: any) {
      navigator.sendBeacon = newSendBeacon
    },
    withRequest(newRequest: any) {
      window.Request = newRequest
    },
    withFetch(...responses: Array<() => Promise<unknown>>) {
      fetchMocks = responses
      return fetchSpy
    },
    withMockXhr(onSend: (xhr: MockXhr) => void) {
      mockXhr()
      MockXhr.onSend = onSend
    },
  }
}
