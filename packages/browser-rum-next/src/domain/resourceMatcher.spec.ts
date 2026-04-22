import type { NetworkRequestResource } from '@datadog/core-next'
import { ResourceMatcher } from './resourceMatcher'

function makeNetworkResource(overrides: Partial<NetworkRequestResource> = {}): NetworkRequestResource {
  return {
    method: 'GET',
    url: '/api/test',
    status: 200,
    isAborted: false,
    startTime: 0,
    startDate: 0,
    duration: 100,
    ...overrides,
  }
}

describe('ResourceMatcher', () => {
  let matcher: ResourceMatcher

  beforeEach(() => {
    matcher = new ResourceMatcher()
  })

  it('matches a network request to a performance entry by URL', () => {
    const resource = makeNetworkResource({ url: '/api/data', startTime: 100 })
    matcher.add(resource)

    const result = matcher.match('/api/data', 100)

    expect(result).toBe(resource)
  })

  it('returns undefined when no network request matches', () => {
    const result = matcher.match('/api/missing', 100)

    expect(result).toBeUndefined()
  })

  it('removes matched entries from buffer', () => {
    const resource = makeNetworkResource({ url: '/api/data', startTime: 100 })
    matcher.add(resource)

    matcher.match('/api/data', 100)
    const result = matcher.match('/api/data', 100)

    expect(result).toBeUndefined()
  })

  it('matches by timing proximity when multiple requests share URL', () => {
    const first = makeNetworkResource({ url: '/api/data', startTime: 100 })
    const second = makeNetworkResource({ url: '/api/data', startTime: 500 })
    matcher.add(first)
    matcher.add(second)

    const result = matcher.match('/api/data', 490)

    expect(result).toBe(second)
  })

  it('evicts entries older than TTL', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date(0))

    const old = makeNetworkResource({ url: '/api/data', startTime: 0 })
    matcher.add(old)

    jasmine.clock().tick(6_000)

    // Adding a new entry triggers evict()
    const fresh = makeNetworkResource({ url: '/api/other', startTime: 6000 })
    matcher.add(fresh)

    const result = matcher.match('/api/data', 0)

    expect(result).toBeUndefined()

    jasmine.clock().uninstall()
  })
})
