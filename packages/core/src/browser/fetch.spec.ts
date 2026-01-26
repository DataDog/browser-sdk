import type { MockZoneJs } from '../../test'
import { mockZoneJs } from '../../test'
import { fetch } from './fetch'

describe('fetch', () => {
  let zoneJs: MockZoneJs

  beforeEach(() => {
    zoneJs = mockZoneJs()
  })

  it('does not use the Zone.js function', async () => {
    const nativeFetchSpy = jasmine.createSpy('nativeFetch').and.returnValue(Promise.resolve(new Response()))
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch').and.returnValue(Promise.resolve(new Response()))

    // Set window.fetch to native, then use replaceProperty to simulate Zone.js patching
    // replaceProperty will store the native version in the symbol and replace window.fetch
    ;(window as any).fetch = nativeFetchSpy
    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com')

    expect(zoneJsFetchSpy).not.toHaveBeenCalled()
    expect(nativeFetchSpy).toHaveBeenCalled()
  })

  it('calls the native fetch function with correct arguments', async () => {
    const nativeFetchSpy = jasmine.createSpy('nativeFetch').and.returnValue(Promise.resolve(new Response('test')))
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response()))
    ;(window as any)[zoneJs.getSymbol('fetch')] = nativeFetchSpy

    await fetch('https://example.com', { method: 'POST' })

    expect(nativeFetchSpy).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
  })

  it('returns the response from native fetch', async () => {
    const mockResponse = new Response('test response', { status: 200 })
    const nativeFetchSpy = jasmine.createSpy('nativeFetch').and.returnValue(Promise.resolve(mockResponse))
    ;(window as any)[zoneJs.getSymbol('fetch')] = nativeFetchSpy

    const response = await fetch('https://example.com')

    expect(response).toBe(mockResponse)
  })
})
