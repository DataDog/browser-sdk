import type { EndpointBuilder } from '../src'
import { INTAKE_TAGS, noop } from '../src'
import { mockXhr, MockXhr } from './emulate/mockXhr'

const INTAKE_PARAMS = INTAKE_TAGS.join('&')

export const SPEC_ENDPOINTS = {
  logsEndpointBuilder: mockEndpointBuilder(`https://mock.com/abcde?${INTAKE_PARAMS}`),
  rumEndpointBuilder: mockEndpointBuilder(`https://mock.com/abcde?${INTAKE_PARAMS}`),
}

export function mockEndpointBuilder(url: string) {
  return { build: (..._: any) => url } as EndpointBuilder
}

export interface Request {
  type: 'xhr' | 'sendBeacon' | 'fetch'
  url: string
  body: string
}

export function interceptRequests() {
  const requests: Request[] = []
  const originalSendBeacon = isSendBeaconSupported() && navigator.sendBeacon.bind(navigator)
  const originalRequest = window.Request
  const originalFetch = window.fetch
  let xhrManager: { reset(): void } | undefined

  spyOn(XMLHttpRequest.prototype, 'open').and.callFake((_, url) => requests.push({ type: 'xhr', url } as Request))
  spyOn(XMLHttpRequest.prototype, 'send').and.callFake((body) => (requests[requests.length - 1].body = body as string))
  if (isSendBeaconSupported()) {
    spyOn(navigator, 'sendBeacon').and.callFake((url, body) => {
      requests.push({ type: 'sendBeacon', url: url as string, body: body as string })
      return true
    })
  }
  if (isFetchKeepAliveSupported()) {
    spyOn(window, 'fetch').and.callFake((url, config) => {
      requests.push({ type: 'fetch', url: url as string, body: config!.body as string })
      return new Promise<Response>(() => undefined)
    })
  }

  function isSendBeaconSupported() {
    return !!navigator.sendBeacon
  }

  function isFetchKeepAliveSupported() {
    return 'fetch' in window && 'keepalive' in new window.Request('')
  }

  return {
    requests,
    isSendBeaconSupported,
    isFetchKeepAliveSupported,
    withSendBeacon(newSendBeacon: any) {
      navigator.sendBeacon = newSendBeacon
    },
    withRequest(newRequest: any) {
      window.Request = newRequest
    },
    withFetch(newFetch: any) {
      window.fetch = newFetch
    },
    withMockXhr(onSend: (xhr: MockXhr) => void) {
      xhrManager = mockXhr()
      MockXhr.onSend = onSend
    },
    restore() {
      if (originalSendBeacon) {
        navigator.sendBeacon = originalSendBeacon
      }
      if (originalRequest) {
        window.Request = originalRequest
      }
      if (originalFetch) {
        window.fetch = originalFetch
      }
      if (xhrManager) {
        xhrManager.reset()
      }
      MockXhr.onSend = noop
    },
  }
}
