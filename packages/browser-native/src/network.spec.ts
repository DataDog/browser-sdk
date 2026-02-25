import { fetch, sendBeacon } from './network'

describe('fetch', () => {
  it('calls window.fetch with the given arguments', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response()))

    await fetch('https://example.com', { method: 'POST' })

    expect(window.fetch).toHaveBeenCalledWith('https://example.com', { method: 'POST' })
  })
})

describe('sendBeacon', () => {
  it('calls navigator.sendBeacon with the given arguments', () => {
    spyOn(navigator, 'sendBeacon').and.returnValue(true)

    const result = sendBeacon('https://example.com', 'data')

    expect(navigator.sendBeacon).toHaveBeenCalledWith('https://example.com', 'data')
    expect(result).toBeTrue()
  })
})
