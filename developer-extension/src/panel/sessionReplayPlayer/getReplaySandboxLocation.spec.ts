import {
  DEV_REPLAY_SANDBOX_ORIGIN,
  DEV_REPLAY_SANDBOX_URL,
  STATIC_HASH_REPLAY_SANDBOX_ORIGIN,
} from '../../common/packagesUrlConstants'
import type { ReplaySandboxSource } from './getReplaySandboxLocation'
import { getReplaySandboxLocation, NoSandboxBuildError } from './getReplaySandboxLocation'

const STATIC_HASH = '0123456789abcdef0123456789abcdef'

describe('getReplaySandboxLocation', () => {
  function mockFetch(response: Response) {
    return spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(response))
  }

  function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body))
  }

  function getLocation(source: ReplaySandboxSource, signal = new AbortController().signal) {
    return getReplaySandboxLocation({ source, signal })
  }

  it('returns the local development sandbox without any request', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')

    const sandboxLocation = await getLocation({ type: 'local' })

    expect(sandboxLocation).toEqual({ origin: DEV_REPLAY_SANDBOX_ORIGIN, url: DEV_REPLAY_SANDBOX_URL })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the current version of the prod sandbox', async () => {
    const fetchSpy = mockFetch(jsonResponse({ version: '35.150903814' }))
    const abortController = new AbortController()

    const sandboxLocation = await getLocation({ type: 'prod' }, abortController.signal)

    expect(sandboxLocation).toEqual({
      origin: 'https://session-replay-datadoghq.com',
      url: 'https://session-replay-datadoghq.com/static-app/v/35.150903814/index.html',
    })
    const [requestUrl, requestInit] = fetchSpy.calls.argsFor(0) as [string, RequestInit]
    expect(requestUrl).toBe('https://app.datadoghq.com/api/ui/session-replay-sandbox/version')
    expect(requestInit.credentials).toBe('omit')
    expect(requestInit.signal).toBe(abortController.signal)
  })

  it('encodes the version in the sandbox URL', async () => {
    mockFetch(jsonResponse({ version: '../1?a' }))

    const sandboxLocation = await getLocation({ type: 'prod' })

    expect(sandboxLocation.url).toBe('https://session-replay-datadoghq.com/static-app/v/..%2F1%3Fa/index.html')
  })

  it('rejects when the version request fails', async () => {
    mockFetch(new Response('', { status: 503 }))

    await expectAsync(getLocation({ type: 'prod' })).toBeRejectedWithError(/503/)
  })

  it('rejects when the version response is not JSON', async () => {
    mockFetch(new Response('not json'))

    await expectAsync(getLocation({ type: 'prod' })).toBeRejected()
  })

  for (const body of [null, {}, { version: '' }, { version: 35 }]) {
    it(`rejects when the version response is ${JSON.stringify(body)}`, async () => {
      mockFetch(jsonResponse(body))

      await expectAsync(getLocation({ type: 'prod' })).toBeRejectedWithError(/no version/)
    })
  }

  describe('with a static hash', () => {
    it('returns the sandbox build of the hash once it makes sure that the build exists', async () => {
      const fetchSpy = mockFetch(new Response(null))
      const abortController = new AbortController()

      const sandboxLocation = await getLocation({ type: 'static-hash', hash: STATIC_HASH }, abortController.signal)

      const sandboxUrl = `${STATIC_HASH_REPLAY_SANDBOX_ORIGIN}/static-app/_h/${STATIC_HASH}/index.html`
      expect(sandboxLocation).toEqual({ origin: STATIC_HASH_REPLAY_SANDBOX_ORIGIN, url: sandboxUrl })
      const [requestUrl, requestInit] = fetchSpy.calls.argsFor(0) as [string, RequestInit]
      expect(requestUrl).toBe(sandboxUrl)
      expect(requestInit.method).toBe('HEAD')
      expect(requestInit.credentials).toBe('omit')
      expect(requestInit.signal).toBe(abortController.signal)
    })

    for (const status of [403, 404]) {
      it(`rejects with a NoSandboxBuildError when the build request returns ${status}`, async () => {
        mockFetch(new Response('', { status }))

        await expectAsync(getLocation({ type: 'static-hash', hash: STATIC_HASH })).toBeRejectedWithError(
          NoSandboxBuildError
        )
      })
    }

    it('rejects when the build request fails', async () => {
      mockFetch(new Response('', { status: 503 }))

      await expectAsync(getLocation({ type: 'static-hash', hash: STATIC_HASH })).toBeRejectedWithError(/503/)
    })

    for (const hash of ['', STATIC_HASH.slice(1), STATIC_HASH.toUpperCase(), `${STATIC_HASH}/..`]) {
      it(`rejects ${JSON.stringify(hash)} with a NoSandboxBuildError, without any request`, async () => {
        const fetchSpy = spyOn(globalThis, 'fetch')

        await expectAsync(getLocation({ type: 'static-hash', hash })).toBeRejectedWithError(NoSandboxBuildError)
        expect(fetchSpy).not.toHaveBeenCalled()
      })
    }
  })
})
