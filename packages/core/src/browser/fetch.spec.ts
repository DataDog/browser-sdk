import { type MockZoneJs, mockZoneJs, registerCleanupTask } from '../../test'
import { fetch } from './fetch'

describe('fetch', () => {
  let zoneJs: MockZoneJs

  beforeEach(() => {
    zoneJs = mockZoneJs()
    const originalFetch = window.fetch
    registerCleanupTask(() => {
      window.fetch = originalFetch
    })
  })

  it('does not use the Zone.js function', async () => {
    const nativeFetchSpy = jasmine.createSpy('nativeFetch')
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch')

    ;(window as any).fetch = nativeFetchSpy
    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com')

    expect(zoneJsFetchSpy).not.toHaveBeenCalled()
    expect(nativeFetchSpy).toHaveBeenCalled()
  })

  it('calls the native fetch function with correct arguments', async () => {
    const nativeFetchSpy = jasmine.createSpy('nativeFetch')
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch')

    ;(window as any).fetch = nativeFetchSpy
    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com', { method: 'POST' })

    expect(nativeFetchSpy).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
  })

  it('returns the response from native fetch', async () => {
    const mockResponse = new Response('test response', { status: 200 })
    const nativeFetchSpy = jasmine.createSpy('nativeFetch').and.returnValue(Promise.resolve(mockResponse))
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch').and.returnValue(Promise.resolve(new Response()))

    ;(window as any).fetch = nativeFetchSpy
    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    const response = await fetch('https://example.com')

    expect(response).toBe(mockResponse)
  })
})
