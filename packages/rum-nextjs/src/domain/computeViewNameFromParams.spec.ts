import { computeViewNameFromParams } from './computeViewNameFromParams'

describe('computeViewNameFromParams', () => {
  // prettier-ignore
  const cases: Array<[string, string, Record<string, string | string[] | undefined>, string]> = [
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
