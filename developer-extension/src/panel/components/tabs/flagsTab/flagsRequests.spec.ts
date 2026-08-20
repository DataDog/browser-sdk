import type { CatalogFlag, FlagCatalogRequest } from './flagsRequests'
import { fetchFlagCatalog, fetchFlagsByKeys } from './flagsRequests'

describe('flagsRequests', () => {
  describe('fetchFlagCatalog', () => {
    const baseRequest: FlagCatalogRequest = {
      page: 1,
      pageSize: 20,
      search: '',
      typeFilter: [],
      tagFilter: [],
      teamFilter: [],
      createdBy: null,
    }

    function mockResponse(body: unknown) {
      return spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response(JSON.stringify(body))))
    }

    it('requests one page server-side (active-only, offset from page) and returns the server total', async () => {
      const sampleFlag: CatalogFlag = {
        key: 'flag-a',
        name: 'Flag A',
        description: 'Controls the new checkout',
        type: 'BOOLEAN',
        variants: [{ name: 'on', value: true }],
        tags: ['x'],
        createdBy: 'user-uuid',
      }
      const sampleTotal = 42
      const spy = mockResponse({
        data: [
          {
            attributes: {
              key: sampleFlag.key,
              name: sampleFlag.name,
              description: sampleFlag.description,
              value_type: sampleFlag.type,
              // The API returns variant values as strings; parseVariantValue turns them back.
              variants: sampleFlag.variants.map(({ name, value }) => ({ name, value: String(value) })),
              tags: sampleFlag.tags,
              created_by: sampleFlag.createdBy,
            },
          },
        ],
        meta: { page: { total: sampleTotal } },
      })

      const page = await fetchFlagCatalog('tok', 'datad0g.com', { ...baseRequest, page: 3, pageSize: 20 })

      const [requestUrl, requestInit] = spy.calls.argsFor(0) as [string, RequestInit]
      const url = new URL(requestUrl)
      expect(url.pathname).toBe('/api/ui/ffe/feature-flags')
      expect(url.searchParams.get('page[limit]')).toBe('20')
      expect(url.searchParams.get('page[offset]')).toBe('40') // (3 - 1) * 20
      expect(url.searchParams.get('is_archived')).toBe('false')
      expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(page.total).toBe(sampleTotal)
      // sampleFlag round-trips including description + createdBy (from attributes.description/created_by).
      expect(page.flags).toEqual([sampleFlag])
    })

    it('sends search, value_type (repeated), and tags (repeated) as server-side filters', async () => {
      const spy = mockResponse({ data: [], meta: { page: { total: 0 } } })

      await fetchFlagCatalog('tok', 'datad0g.com', {
        page: 1,
        pageSize: 20,
        search: 'checkout',
        typeFilter: ['BOOLEAN', 'STRING'],
        tagFilter: ['team:x', 'beta'],
        teamFilter: [],
        createdBy: null,
      })

      const [requestUrl] = spy.calls.argsFor(0) as [string, RequestInit]
      const url = new URL(requestUrl)
      expect(url.searchParams.get('search')).toBe('checkout')
      expect(url.searchParams.getAll('value_type')).toEqual(['BOOLEAN', 'STRING'])
      expect(url.searchParams.getAll('tags')).toEqual(['team:x', 'beta'])
    })

    it('sends "My feature flags" as created_by and "My teams" as team:<handle> tags', async () => {
      const spy = mockResponse({ data: [], meta: { page: { total: 0 } } })

      await fetchFlagCatalog('tok', 'datad0g.com', {
        ...baseRequest,
        tagFilter: ['beta'],
        teamFilter: ['alpha', 'gamma'],
        createdBy: 'user-uuid',
      })

      const url = new URL(spy.calls.argsFor(0)[0] as string)
      expect(url.searchParams.get('created_by')).toBe('user-uuid')
      // Regular tags and team tags ride the same `tags` param; the server splits them by prefix.
      expect(url.searchParams.getAll('tags')).toEqual(['beta', 'team:alpha', 'team:gamma'])
    })

    it('omits created_by when "My feature flags" is off', async () => {
      const spy = mockResponse({ data: [], meta: { page: { total: 0 } } })
      await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      expect(new URL(spy.calls.argsFor(0)[0] as string).searchParams.has('created_by')).toBe(false)
    })

    it('omits the search param when the term is empty', async () => {
      const spy = mockResponse({ data: [], meta: { page: { total: 0 } } })
      await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      const [requestUrl] = spy.calls.argsFor(0) as [string, RequestInit]
      expect(new URL(requestUrl).searchParams.has('search')).toBe(false)
    })

    it('parses variant values by declared type, falling back to the raw string on bad input', async () => {
      mockResponse({
        data: [
          {
            attributes: {
              key: 'f',
              value_type: 'JSON',
              variants: [
                { name: 'ok', value: '{"a":1}' },
                { name: 'bad', value: 'not json' },
              ],
            },
          },
          {
            attributes: {
              key: 'n',
              value_type: 'INTEGER',
              variants: [
                { name: 'five', value: '5' },
                { name: 'nan', value: 'abc' },
              ],
            },
          },
        ],
        meta: { page: { total: 2 } },
      })

      const { flags } = await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      expect(flags[0].variants[0].value).toEqual({ a: 1 })
      expect(flags[0].variants[1].value).toBe('not json')
      expect(flags[1].variants[0].value).toBe(5)
      expect(flags[1].variants[1].value).toBe('abc')
    })

    it('keeps malformed or out-of-range variant values raw instead of coercing them', async () => {
      mockResponse({
        data: [
          {
            attributes: {
              key: 'b',
              value_type: 'BOOLEAN',
              variants: [
                { name: 't', value: 'true' },
                { name: 'f', value: 'false' },
                { name: 'weird', value: 'True' },
              ],
            },
          },
          {
            attributes: {
              key: 'i',
              value_type: 'INTEGER',
              variants: [
                { name: 'partial', value: '5abc' },
                { name: 'float', value: '5.5' },
                { name: 'unsafe', value: '9007199254740993' },
              ],
            },
          },
          {
            attributes: {
              key: 'd',
              value_type: 'NUMERIC',
              variants: [
                { name: 'ok', value: '5.5' },
                { name: 'partial', value: '5abc' },
                { name: 'empty', value: '' },
              ],
            },
          },
        ],
        meta: { page: { total: 3 } },
      })

      const { flags } = await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      const [booleanFlag, integer, numeric] = flags
      expect(booleanFlag.variants.map((variant) => variant.value)).toEqual([true, false, 'True'])
      expect(integer.variants.map((variant) => variant.value)).toEqual(['5abc', '5.5', '9007199254740993'])
      expect(numeric.variants.map((variant) => variant.value)).toEqual([5.5, '5abc', ''])
    })

    it('dedupes flags sharing a key within a page, keeping the first occurrence', async () => {
      mockResponse({
        data: [
          { attributes: { key: 'dup', name: 'First', value_type: 'STRING', variants: [], tags: [] } },
          { attributes: { key: 'dup', name: 'Second', value_type: 'STRING', variants: [], tags: [] } },
        ],
        meta: { page: { total: 2 } },
      })

      const { flags } = await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      expect(flags.length).toBe(1)
      expect(flags[0].name).toBe('First')
    })

    it('falls back to the key for a missing name and defaults description/tags/variants', async () => {
      mockResponse({ data: [{ attributes: { key: 'no-name', value_type: 'STRING' } }], meta: { page: { total: 1 } } })

      const { flags } = await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      expect(flags[0].name).toBe('no-name')
      expect(flags[0].description).toBe('')
      expect(flags[0].tags).toEqual([])
      expect(flags[0].variants).toEqual([])
      expect(flags[0].createdBy).toBeUndefined()
    })

    it('tolerates a response that omits data/meta, falling total back to the page length', async () => {
      mockResponse({ errors: ['x'] })
      const page = await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)
      expect(page.flags).toEqual([])
      expect(page.total).toBe(0)
    })

    it('falls back total to the number of returned flags when meta.page.total is missing', async () => {
      mockResponse({
        data: [{ attributes: { key: 'a', value_type: 'STRING' } }, { attributes: { key: 'b', value_type: 'STRING' } }],
      })
      expect((await fetchFlagCatalog('tok', 'datad0g.com', baseRequest)).total).toBe(2)
    })

    it('throws on a non-ok response', async () => {
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response('err', { status: 500, statusText: 'Server Error' }))
      )
      await expectAsync(fetchFlagCatalog('tok', 'datad0g.com', baseRequest)).toBeRejectedWithError(
        /Failed to fetch flag catalog/
      )
    })
  })

  describe('fetchFlagsByKeys', () => {
    it('fetches each key exactly (active-only) and returns the flags that resolve', async () => {
      const spy = spyOn(globalThis, 'fetch').and.callFake((input) => {
        const key = new URL(input as string).searchParams.get('key')
        const data = key === 'missing' ? [] : [{ attributes: { key, name: `Name ${key}`, value_type: 'STRING' } }]
        return Promise.resolve(new Response(JSON.stringify({ data })))
      })

      const flags = await fetchFlagsByKeys('tok', 'datad0g.com', ['flag-a', 'missing', 'flag-b'])

      expect(spy).toHaveBeenCalledTimes(3)
      const firstUrl = new URL(spy.calls.argsFor(0)[0] as string)
      expect(firstUrl.searchParams.get('key')).toBe('flag-a')
      expect(firstUrl.searchParams.get('is_archived')).toBe('false')
      expect(flags.map((flag) => flag.key)).toEqual(['flag-a', 'flag-b'])
    })

    it('makes no request and returns nothing for an empty key list', async () => {
      const spy = spyOn(globalThis, 'fetch')
      expect(await fetchFlagsByKeys('tok', 'datad0g.com', [])).toEqual([])
      expect(spy).not.toHaveBeenCalled()
    })

    it('drops a key whose request fails but keeps the ones that resolve', async () => {
      spyOn(globalThis, 'fetch').and.callFake((input) => {
        const key = new URL(input as string).searchParams.get('key')
        if (key === 'boom') {
          return Promise.resolve(new Response('nope', { status: 500, statusText: 'X' }))
        }
        return Promise.resolve(
          new Response(JSON.stringify({ data: [{ attributes: { key, name: `Name ${key}`, value_type: 'STRING' } }] }))
        )
      })

      const flags = await fetchFlagsByKeys('tok', 'datad0g.com', ['flag-a', 'boom', 'flag-b'])
      expect(flags.map((flag) => flag.key)).toEqual(['flag-a', 'flag-b'])
    })
  })
})
