import { vi, beforeEach, describe, expect, it, test } from 'vitest'
import { type MockZoneJs, mockZoneJs } from '../../test'
import { fetch } from './fetch'

describe('fetch', () => {
  let zoneJs: MockZoneJs

  beforeEach(() => {
    zoneJs = mockZoneJs()
  })

  it('does not use the Zone.js function', async () => {
    const nativeFetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response())
    const zoneJsFetchSpy = vi.fn()

    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com')

    expect(zoneJsFetchSpy).not.toHaveBeenCalled()
    expect(nativeFetchSpy).toHaveBeenCalled()
  })

  it('calls the native fetch function with correct arguments', async () => {
    const nativeFetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response())
    const zoneJsFetchSpy = vi.fn()

    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    await fetch('https://example.com', { method: 'POST' })

    expect(nativeFetchSpy).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
  })

  it('returns the response from native fetch', async () => {
    const mockResponse = new Response('test response', { status: 200 })
    vi.spyOn(window, 'fetch').mockReturnValue(Promise.resolve(mockResponse))
    const zoneJsFetchSpy = vi.fn().mockReturnValue(Promise.resolve(new Response()))

    zoneJs.replaceProperty(window, 'fetch', zoneJsFetchSpy)

    const response = await fetch('https://example.com')

    expect(response).toBe(mockResponse)
  })
})
