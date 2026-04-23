import {
  mockClock,
  interceptRequests,
  DEFAULT_FETCH_MOCK,
  TOO_MANY_REQUESTS_FETCH_MOCK,
  NETWORK_ERROR_FETCH_MOCK,
} from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../../rum-core/test'
import { checkProfilingQuota } from './quotaCheck'

describe('checkProfilingQuota', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  it('returns quota-ok on HTTP 200', async () => {
    interceptor.withFetch(DEFAULT_FETCH_MOCK)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toBe('quota-ok')
  })

  it('returns quota-exceeded on HTTP 429', async () => {
    // Both quota_exceeded and org_disabled map to HTTP 429 — the SDK only inspects status code,
    // not the response body, so a single 429 test covers both backend reasons.
    interceptor.withFetch(TOO_MANY_REQUESTS_FETCH_MOCK)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toBe('quota-exceeded')
  })

  it('returns quota-ok on network error (fail-open)', async () => {
    interceptor.withFetch(NETWORK_ERROR_FETCH_MOCK)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toBe('quota-ok')
  })

  it('returns quota-ok when fetch times out', async () => {
    const clock = mockClock() // auto-cleaned via registerCleanupTask — no manual cleanup needed
    // Never-resolving fetch
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    interceptor.withFetch(() => new Promise(() => {}))
    // Use a short timeout (100ms) so clock.tick() stays well under Jasmine's 5000ms async limit
    const promise = checkProfilingQuota(mockRumConfiguration(), 'session-123', 100)
    clock.tick(100)
    const result = await promise
    expect(result).toBe('quota-ok')
  })

  it('builds the URL with site and session_id', async () => {
    interceptor.withFetch(DEFAULT_FETCH_MOCK)
    await checkProfilingQuota(mockRumConfiguration({ site: 'datadoghq.com', clientToken: 'my-token' }), 'session-abc')
    expect(interceptor.requests[0].url).toBe(
      'https://app.datadoghq.com/api/unstable/profiling/admission?session_id=session-abc'
    )
  })

  it('uses the dd.datad0g.com base URL for datad0g.com site', async () => {
    interceptor.withFetch(DEFAULT_FETCH_MOCK)
    await checkProfilingQuota(mockRumConfiguration({ site: 'datad0g.com', clientToken: 'my-token' }), 'session-abc')
    expect(interceptor.requests[0].url).toBe(
      'https://dd.datad0g.com/api/unstable/profiling/admission?session_id=session-abc'
    )
  })
})
