import { interceptRequests } from '@datadog/browser-core/test'
import { fetchRemoteConfiguration } from './remoteConfigurationFetch'

describe('fetchRemoteConfiguration', () => {
  const options = { site: 'datadoghq.com', remoteConfigurationId: 'test-id' }
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  it('returns ok:true with the parsed config on success', async () => {
    const config = { rum: { applicationId: 'abc', sessionSampleRate: 50 } }
    interceptor.withFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(config),
      })
    )

    const result = await fetchRemoteConfiguration(options)
    expect(result).toEqual({ ok: true, value: config })
  })

  it('returns ok:false on HTTP error (non-ok response)', async () => {
    interceptor.withFetch(() => Promise.resolve({ ok: false, status: 404 }))

    const result = await fetchRemoteConfiguration(options)
    expect(result.ok).toBeFalse()
    expect((result as { ok: false; error: Error }).error).toBeInstanceOf(Error)
  })

  it('returns ok:false on network failure (fetch throws)', async () => {
    interceptor.withFetch(() => Promise.reject(new Error('Network error')))

    const result = await fetchRemoteConfiguration(options)
    expect(result.ok).toBeFalse()
    expect((result as { ok: false; error: Error }).error).toBeInstanceOf(Error)
  })
})
