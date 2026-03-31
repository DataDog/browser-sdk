import { computeViewName } from './startAngularView'
import type { RouteSnapshot } from './types'

function createSnapshot(
  path: string | undefined,
  children: RouteSnapshot[] = [],
  outlet: string = 'primary',
  url: Array<{ path: string }> = []
): RouteSnapshot {
  return {
    routeConfig: path !== undefined ? { path } : null,
    children,
    outlet,
    url,
  }
}

/**
 * Build a RouteSnapshot tree from a compact route string and an actual path.
 *
 * Route string format mirrors the React Router test convention:
 * 'foo > bar > :id' represents nested routes { path: 'foo', children: [{ path: 'bar', children: [{ path: ':id' }] }] }
 *
 * The actualPath is used to compute the URL segments matched by '**' wildcards,
 * since Angular stores the matched segments on the wildcard node's `url` property.
 */
function buildSnapshot(routePaths: string, actualPath: string): RouteSnapshot {
  const paths = routePaths.split(' > ')

  // Compute prefix consumed before the wildcard to derive matched URL segments
  const wildcardIndex = paths.indexOf('**')
  let wildcardUrl: Array<{ path: string }> = []
  if (wildcardIndex !== -1) {
    const prefixSegments = paths.slice(0, wildcardIndex).filter((p) => p !== '')
    let remaining = actualPath.startsWith('/') ? actualPath.slice(1) : actualPath
    for (const prefix of prefixSegments) {
      if (remaining.startsWith(prefix)) {
        remaining = remaining.slice(prefix.length)
        if (remaining.startsWith('/')) {
          remaining = remaining.slice(1)
        }
      }
    }
    wildcardUrl = remaining ? remaining.split('/').map((s) => ({ path: s })) : []
  }

  // Build snapshot chain from right to left
  let current: RouteSnapshot | undefined
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i]
    const url = path === '**' ? wildcardUrl : []
    current = createSnapshot(path, current ? [current] : [], 'primary', url)
  }

  // Wrap in root node (null routeConfig), matching Angular's ActivatedRouteSnapshot tree
  return createSnapshot(undefined, current ? [current] : [])
}

describe('computeViewName', () => {
  it('returns / when root has no children', () => {
    expect(computeViewName(createSnapshot(undefined))).toBe('/')
  })

  it('follows primary outlet only, ignoring named outlets', () => {
    const primaryChild = createSnapshot('users', [], 'primary')
    const namedChild = createSnapshot('sidebar', [], 'sidebar')
    const root = createSnapshot(undefined, [namedChild, primaryChild])
    expect(computeViewName(root)).toBe('/users')
  })

  // prettier-ignore
  const cases = [
    // route paths,                  actual path,        expected view name

    // Simple paths
    ['',                             '/',                '/'],
    ['users',                        '/users',           '/users'],
    ['users > :id',                  '/users/42',        '/users/:id'],
    ['users > :id > posts > :postId','/users/1/posts/2', '/users/:id/posts/:postId'],
    ['users/list',                   '/users/list',      '/users/list'],

    // Empty-path wrappers (layout routes)
    [' > users > :id',              '/users/42',         '/users/:id'],
    [' >  > users',                 '/users',            '/users'],

    // Lazy-loaded routes (same shape post-resolution)
    ['admin > settings',            '/admin/settings',   '/admin/settings'],

    // Wildcards
    ['**',                          '/foo/bar',          '/foo/bar'],
    ['**',                          '/',                 '/'],
    ['admin > **',                  '/admin/foo',        '/admin/foo'],
  ] as const

  cases.forEach(([routePaths, path, expectedViewName]) => {
    it(`returns "${expectedViewName}" for path "${path}" with routes "${routePaths}"`, () => {
      const root = buildSnapshot(routePaths, path)
      expect(computeViewName(root)).toBe(expectedViewName)
    })
  })
})
