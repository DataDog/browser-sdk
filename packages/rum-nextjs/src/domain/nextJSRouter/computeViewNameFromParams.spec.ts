import type { useParams } from 'next/navigation'
import { computeViewNameFromParams } from './computeViewNameFromParams'

type Params = ReturnType<typeof useParams>

describe('computeViewNameFromParams', () => {
  // prettier-ignore
  const cases: Array<[string, string, Params, string]> = [
    // [description,                              pathname,                params,                                    expected]
    // Static routes
    ['static path',                                '/about',                {},                                        '/about'],
    ['nested static path',                         '/static/page',          {},                                        '/static/page'],
    // Single dynamic segment
    ['single dynamic segment',                     '/users/123',            { id: '123' },                             '/users/[id]'],
    // Multiple dynamic segments
    ['multiple dynamic segments',                  '/users/123/posts/456',  { userId: '123', postId: '456' },          '/users/[userId]/posts/[postId]'],
    // Catch-all routes
    ['catch-all with multiple segments',           '/docs/a/b/c',           { slug: ['a', 'b', 'c'] },                '/docs/[...slug]'],
    ['catch-all with single segment',              '/docs/intro',           { slug: ['intro'] },                       '/docs/[...slug]'],
    // Ordering
    ['longer values replaced first',               '/items/123/1',          { id: '123', subId: '1' },                '/items/[id]/[subId]'],
    // Param value is a substring of another segment
    ['does not match inside a static segment',     '/product/pro',          { id: 'pro' },                             '/product/[id]'],
    ['catch-all does not match partial segments',  '/docs-extra/a/b',       { slug: ['a', 'b'] },                      '/docs-extra/[...slug]'],
    // Catch-all processed before regular params (prevents a shared value being consumed by the regular param first)
    ['catch-all takes priority over same-value regular param', '/x/a/b', { id: 'a', slug: ['a', 'b'] }, '/x/[...slug]'],
    // Repeated param values
    ['same value for multiple params: assigned left-to-right', '/toto/toto', { user: 'toto', view: 'toto' }, '/[user]/[view]'],
    ['param value appears in static segment: first occurrence taken', '/toto/toto', { user: 'toto' }, '/[user]/toto'],
    // Edge cases
    ['undefined param values ignored',             '/users/123',            { id: '123', optional: undefined },        '/users/[id]'],
    ['empty string param values ignored',          '/users/123',            { id: '123', empty: '' },                  '/users/[id]'],
    ['empty catch-all array ignored',              '/docs',                 { slug: [] },                              '/docs'],
  ]

  cases.forEach(([description, pathname, params, expected]) => {
    it(`${description}: "${pathname}" → "${expected}"`, () => {
      expect(computeViewNameFromParams(pathname, params)).toBe(expected)
    })
  })
})
