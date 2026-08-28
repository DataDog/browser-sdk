import { fetchCurrentUserId, fetchFlagIdentity, fetchMyTeamHandles } from './flagIdentity'

describe('flagIdentity', () => {
  // Routes each request to a handler keyed by a substring of the path, so a test only has to
  // describe the endpoints it cares about.
  function mockEndpoints(handlers: Record<string, () => Response>) {
    const requests: string[] = []
    spyOn(globalThis, 'fetch').and.callFake((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requests.push(url)
      for (const [fragment, respond] of Object.entries(handlers)) {
        if (url.includes(fragment)) {
          return Promise.resolve(respond())
        }
      }
      return Promise.resolve(new Response('not found', { status: 404, statusText: 'Not Found' }))
    })
    return requests
  }

  function json(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), init)
  }

  describe('fetchCurrentUserId', () => {
    it('returns the user UUID from the response id', async () => {
      const requests = mockEndpoints({ '/api/v2/current_user': () => json({ data: { id: 'user-uuid' } }) })

      expect(await fetchCurrentUserId('tok', 'datad0g.com')).toBe('user-uuid')
      expect(requests[0]).toBe('https://dd.datad0g.com/api/v2/current_user')
    })

    it('returns null when the response omits the id', async () => {
      mockEndpoints({ '/api/v2/current_user': () => json({ data: {} }) })
      expect(await fetchCurrentUserId('tok', 'datad0g.com')).toBeNull()
    })

    it('throws on a non-ok response', async () => {
      mockEndpoints({ '/api/v2/current_user': () => json({}, { status: 500, statusText: 'Server Error' }) })
      await expectAsync(fetchCurrentUserId('tok', 'datad0g.com')).toBeRejectedWithError(/failed: 500/)
    })
  })

  describe('fetchMyTeamHandles', () => {
    it('requests only the caller’s teams and returns sorted handles', async () => {
      const requests = mockEndpoints({
        '/api/v2/team': () =>
          json({ data: [{ attributes: { handle: 'zebra' } }, { attributes: { handle: 'alpha' } }] }),
      })

      expect(await fetchMyTeamHandles('tok', 'datad0g.com')).toEqual(['alpha', 'zebra'])
      expect(requests[0]).toContain('filter%5Bme%5D=true')
    })

    it('dedupes handles repeated within the page', async () => {
      mockEndpoints({
        '/api/v2/team': () => json({ data: [{ attributes: { handle: 'a' } }, { attributes: { handle: 'a' } }] }),
      })
      expect(await fetchMyTeamHandles('tok', 'datad0g.com')).toEqual(['a'])
    })

    it('skips entries without a handle', async () => {
      mockEndpoints({ '/api/v2/team': () => json({ data: [{ attributes: {} }, {}] }) })
      expect(await fetchMyTeamHandles('tok', 'datad0g.com')).toEqual([])
    })
  })

  describe('fetchFlagIdentity', () => {
    it('returns both facts when the token can read teams', async () => {
      mockEndpoints({
        '/api/v2/current_user': () => json({ data: { id: 'user-uuid' } }),
        '/api/v2/team': () => json({ data: [{ attributes: { handle: 'my-squad' } }] }),
      })

      expect(await fetchFlagIdentity('tok', 'datad0g.com')).toEqual({
        userId: 'user-uuid',
        teamHandles: ['my-squad'],
        teamsForbidden: false,
        teamsUnavailable: false,
      })
    })

    // The teams endpoint requires the teams_read permission, which the OAuth client may not have
    // been granted. That has to degrade to "team filter unavailable", not to a failed identity.
    it('reports teamsForbidden on a 403 from the teams endpoint, keeping the user id', async () => {
      mockEndpoints({
        '/api/v2/current_user': () => json({ data: { id: 'user-uuid' } }),
        '/api/v2/team': () => json({ errors: ['Forbidden'] }, { status: 403, statusText: 'Forbidden' }),
      })

      expect(await fetchFlagIdentity('tok', 'datad0g.com')).toEqual({
        userId: 'user-uuid',
        teamHandles: [],
        teamsForbidden: true,
        teamsUnavailable: false,
      })
    })

    // A non-403 team failure (network/server) is a genuine lookup failure, distinct from an empty
    // membership — teamsUnavailable, not teamsForbidden, so the UI says "couldn't load".
    it('reports teamsUnavailable (not teamsForbidden) for a non-403 team failure', async () => {
      mockEndpoints({
        '/api/v2/current_user': () => json({ data: { id: 'user-uuid' } }),
        '/api/v2/team': () => json({}, { status: 500, statusText: 'Server Error' }),
      })

      expect(await fetchFlagIdentity('tok', 'datad0g.com')).toEqual({
        userId: 'user-uuid',
        teamHandles: [],
        teamsForbidden: false,
        teamsUnavailable: true,
      })
    })

    it('keeps the team handles when only the user lookup fails', async () => {
      mockEndpoints({
        '/api/v2/current_user': () => json({}, { status: 403, statusText: 'Forbidden' }),
        '/api/v2/team': () => json({ data: [{ attributes: { handle: 'my-squad' } }] }),
      })

      expect(await fetchFlagIdentity('tok', 'datad0g.com')).toEqual({
        userId: null,
        teamHandles: ['my-squad'],
        teamsForbidden: false,
        teamsUnavailable: false,
      })
    })
  })
})
