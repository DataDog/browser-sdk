import { mockClock, interceptRequests, NETWORK_ERROR_FETCH_MOCK } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../../rum-core/test'
import { checkProfilingQuota } from './quotaCheck'

const backendResponse =
  (admitted: boolean, reason: string, status = admitted ? 200 : 429) =>
  () =>
    Promise.resolve({
      status,
      json: () => Promise.resolve({ data: { attributes: { admitted, reason } } }),
    })

describe('checkProfilingQuota', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  // admitted: true → quota_ok decision
  it('returns quota_ok decision for reason quota_ok', async () => {
    interceptor.withFetch(backendResponse(true, 'quota_ok') as any)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ok', reason: 'quota_ok' })
  })

  it('returns quota_ok decision for reason backend_unavailable', async () => {
    interceptor.withFetch(backendResponse(true, 'backend_unavailable') as any)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ok', reason: 'backend_unavailable' })
  })

  it('returns quota_ok decision for reason backend_client_not_initialized', async () => {
    interceptor.withFetch(backendResponse(true, 'backend_client_not_initialized') as any)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ok', reason: 'backend_client_not_initialized' })
  })

  // admitted: false → quota_ko decision
  it('returns quota_ko decision for reason quota_exceeded', async () => {
    interceptor.withFetch(backendResponse(false, 'quota_exceeded') as any)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ko', reason: 'quota_exceeded' })
  })

  it('returns quota_ko decision for reason org_disabled', async () => {
    interceptor.withFetch(backendResponse(false, 'org_disabled') as any)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ko', reason: 'org_disabled' })
  })

  it('returns quota_ko decision for reason undefined', async () => {
    interceptor.withFetch(backendResponse(false, 'undefined') as any)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ko', reason: 'undefined' })
  })

  // Fail-open cases → quota_ok decision with frontend reason
  it('returns quota_ok with api-error reason on network error', async () => {
    interceptor.withFetch(NETWORK_ERROR_FETCH_MOCK)
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ok', reason: 'api-error' })
  })

  it('returns quota_ok with api-error reason when response body is unparseable and status is 200', async () => {
    interceptor.withFetch(
      () => Promise.resolve({ status: 200, json: () => Promise.reject(new Error('invalid json')) }) as any
    )
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ok', reason: 'api-error' })
  })

  it('returns quota_ko with quota_exceeded reason when response body is unparseable and status is 429', async () => {
    interceptor.withFetch(
      () => Promise.resolve({ status: 429, json: () => Promise.reject(new Error('invalid json')) }) as any
    )
    const result = await checkProfilingQuota(mockRumConfiguration(), 'session-123')
    expect(result).toEqual({ decision: 'quota_ko', reason: 'quota_exceeded' })
  })

  it('returns quota_ok with timeout reason when fetch times out', async () => {
    const clock = mockClock() // auto-cleaned via registerCleanupTask — no manual cleanup needed
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    interceptor.withFetch(() => new Promise(() => {}))
    const promise = checkProfilingQuota(mockRumConfiguration(), 'session-123', 100)
    clock.tick(100)
    const result = await promise
    expect(result).toEqual({ decision: 'quota_ok', reason: 'timeout' })
  })

  it('builds the URL following the browser-intake-* host pattern', async () => {
    interceptor.withFetch(backendResponse(true, 'quota_ok') as any)
    await checkProfilingQuota(mockRumConfiguration({ site: 'datadoghq.com', clientToken: 'my-token' }), 'session-abc')
    expect(interceptor.requests[0].url).toBe(
      'https://quota.browser-intake-datadoghq.com/api/v2/profiling/quota?session_id=session-abc'
    )
  })

  it('derives the host correctly for non-US1 sites', async () => {
    interceptor.withFetch(backendResponse(true, 'quota_ok') as any)
    await checkProfilingQuota(mockRumConfiguration({ site: 'datadoghq.eu' }), 'session-abc')
    expect(interceptor.requests[0].url).toBe(
      'https://quota.browser-intake-datadoghq.eu/api/v2/profiling/quota?session_id=session-abc'
    )
  })

  it('derives the host correctly for staging (datad0g.com)', async () => {
    interceptor.withFetch(backendResponse(true, 'quota_ok') as any)
    await checkProfilingQuota(mockRumConfiguration({ site: 'datad0g.com' }), 'session-abc')
    expect(interceptor.requests[0].url).toBe(
      'https://quota.browser-intake-datad0g.com/api/v2/profiling/quota?session_id=session-abc'
    )
  })
})
