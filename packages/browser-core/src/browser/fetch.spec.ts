import { type MockZoneJs, mockZoneJs } from '../../test'
import { fetch } from './fetch'

describe('fetch', () => {
  let zoneJs: MockZoneJs

  beforeEach(() => {
    zoneJs = mockZoneJs()
  })

  it('does not use the Zone.js function', async () => {
    const nativeFetchSpy = spyOn(window, 'fetch')
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch')

    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com')

    expect(zoneJsFetchSpy).not.toHaveBeenCalled()
    expect(nativeFetchSpy).toHaveBeenCalled()
  })

  it('calls the native fetch function with correct arguments', async () => {
    const nativeFetchSpy = spyOn(window, 'fetch')
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch')

    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com', { method: 'POST' })

    expect(nativeFetchSpy).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
  })

  it('returns the response from native fetch', async () => {
    const mockResponse = new Response('test response', { status: 200 })
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(mockResponse))
    const zoneJsFetchSpy = jasmine.createSpy('zoneJsFetch').and.returnValue(Promise.resolve(new Response()))

    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    const response = await fetch('https://example.com')

    expect(response).toBe(mockResponse)
  })
})
