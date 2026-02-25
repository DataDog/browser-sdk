import type { BrowserWindowWithZoneJs } from './getZoneJsOriginalValue'
import { fetch, sendBeacon } from './network'

describe('fetch', () => {
  it('calls window.fetch with the given arguments and returns the response', async () => {
    const mockResponse = new Response('test', { status: 200 })
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(mockResponse))

    const result = await fetch('https://example.com', { method: 'POST' })

    expect(window.fetch).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
    expect(result).toBe(mockResponse)
  })

  describe('Zone.js bypass', () => {
    // Simulate Zone.js presence: Zone.js stores originals under __zone_symbol__<name>
    // and exposes window.Zone.__symbol__ to build that key.
    beforeEach(() => {
      ;(window as BrowserWindowWithZoneJs).Zone = {
        __symbol__: (name: string) => `__zone_symbol__${name}`,
      }
    })

    afterEach(() => {
      delete (window as BrowserWindowWithZoneJs).Zone
      delete (window as any).__zone_symbol__fetch
    })

    it('uses the Zone.js original fetch instead of the patched window.fetch', async () => {
      const nativeFetchSpy = spyOn(window, 'fetch')
      const zoneOriginalFetch = jasmine.createSpy('zoneOriginalFetch').and.returnValue(Promise.resolve(new Response()))

      // Zone.js replaces window.fetch with a patched version and stores the original
      // under window.__zone_symbol__fetch
      ;(window as any).__zone_symbol__fetch = zoneOriginalFetch

      await fetch('https://example.com')

      expect(zoneOriginalFetch).toHaveBeenCalled()
      expect(nativeFetchSpy).not.toHaveBeenCalled()
    })
  })
})

describe('sendBeacon', () => {
  it('calls navigator.sendBeacon with the given arguments', () => {
    spyOn(navigator, 'sendBeacon').and.returnValue(true)

    const result = sendBeacon('https://example.com', 'data')

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(navigator.sendBeacon).toHaveBeenCalledWith('https://example.com', 'data')
    expect(result).toBeTrue()
  })
})
