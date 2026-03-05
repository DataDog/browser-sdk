import { computeNextViewName } from './computeNextViewName'

describe('computeNextViewName', () => {
  // prettier-ignore
  const cases = [
    // [pathname, params, expectedViewName]

    // Static routes (no params)
    ['/about', {}, '/about'],
    ['/search', {}, '/search'],
    ['/', {}, '/'],

    // Single dynamic segment
    ['/users/123', { id: '123' }, '/users/:id'],

    // Multiple dynamic segments
    ['/users/123/posts/456', { userId: '123', postId: '456' }, '/users/:userId/posts/:postId'],

    // Param value appears multiple times (FR-4)
    ['/a/123/b/123', { id: '123' }, '/a/:id/b/:id'],

    // Catch-all segments (FR-3) — string array params
    ['/docs/a/b/c', { slug: ['a', 'b', 'c'] }, '/docs/:slug'],

    // Catch-all from root
    ['/docs/getting-started', { slug: ['docs', 'getting-started'] }, '/:slug'],

    // Segment-aware replacement (does NOT replace inside segment names)
    ['/abc/a/def', { id: 'a' }, '/abc/:id/def'],

    // Undefined param value (optional catch-all with no match) — skipped
    ['/foo', { opt: undefined }, '/foo'],

    // Empty string param value — skipped
    ['/foo', { empty: '' }, '/foo'],

    // Catch-all with single segment
    ['/blog/hello', { slug: ['hello'] }, '/blog/:slug'],

    // Mixed dynamic + catch-all
    ['/users/42/files/a/b', { id: '42', path: ['a', 'b'] }, '/users/:id/files/:path'],
  ] as const

  cases.forEach(([pathname, params, expectedViewName]) => {
    it(`returns "${expectedViewName}" for pathname "${pathname}" and params ${JSON.stringify(params)}`, () => {
      expect(computeNextViewName(pathname, params as any)).toBe(expectedViewName)
    })
  })
})
