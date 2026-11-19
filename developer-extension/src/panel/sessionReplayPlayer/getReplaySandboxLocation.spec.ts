import { describe, expect, it, vi } from 'vitest'
import { DEV_REPLAY_SANDBOX_ORIGIN, DEV_REPLAY_SANDBOX_URL } from '../../common/packagesUrlConstants'
import { getReplaySandboxLocation } from './getReplaySandboxLocation'

describe('getReplaySandboxLocation', () => {
  function mockFetch(response: Response) {
    return vi.spyOn(globalThis, 'fetch').mockReturnValue(Promise.resolve(response))
  }

  function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body))
  }

  it('returns the local development sandbox without any request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(undefined as never)

    const sandboxLocation = await getReplaySandboxLocation(true, new AbortController().signal)

    expect(sandboxLocation).toEqual({ origin: DEV_REPLAY_SANDBOX_ORIGIN, url: DEV_REPLAY_SANDBOX_URL })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the current version of the prod sandbox', async () => {
    const fetchSpy = mockFetch(jsonResponse({ version: '35.150903814' }))
    const abortController = new AbortController()

    const sandboxLocation = await getReplaySandboxLocation(false, abortController.signal)

    expect(sandboxLocation).toEqual({
      origin: 'https://session-replay-datadoghq.com',
      url: 'https://session-replay-datadoghq.com/static-app/v/35.150903814/index.html',
    })
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe('https://app.datadoghq.com/api/ui/session-replay-sandbox/version')
    expect(requestInit.credentials).toBe('omit')
    expect(requestInit.signal).toBe(abortController.signal)
  })

  it('encodes the version in the sandbox URL', async () => {
    mockFetch(jsonResponse({ version: '../1?a' }))

    const sandboxLocation = await getReplaySandboxLocation(false, new AbortController().signal)

    expect(sandboxLocation.url).toBe('https://session-replay-datadoghq.com/static-app/v/..%2F1%3Fa/index.html')
  })

  it('rejects when the version request fails', async () => {
    mockFetch(new Response('', { status: 503 }))

    await expect(getReplaySandboxLocation(false, new AbortController().signal)).rejects.toThrow(/503/)
  })

  it('rejects when the version response is not JSON', async () => {
    mockFetch(new Response('not json'))

    await expect(getReplaySandboxLocation(false, new AbortController().signal)).toBeRejected()
  })

  for (const body of [null, {}, { version: '' }, { version: 35 }]) {
    it(`rejects when the version response is ${JSON.stringify(body)}`, async () => {
      mockFetch(jsonResponse(body))

      await expect(getReplaySandboxLocation(false, new AbortController().signal)).rejects.toThrow(/no version/)
    })
  }
})
