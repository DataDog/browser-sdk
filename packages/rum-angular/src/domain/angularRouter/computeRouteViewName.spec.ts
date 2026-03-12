import { computeRouteViewName } from './computeRouteViewName'
import type { RouteSnapshot } from './types'

function createSnapshot(
  path: string | undefined,
  children: RouteSnapshot[] = [],
  outlet: string = 'primary'
): RouteSnapshot {
  return {
    routeConfig: path !== undefined ? { path } : null,
    children,
    outlet,
  }
}

// Build a linear chain of snapshots (root → child1 → child2 → ...)
// undefined means null routeConfig (root node pattern)
function createSnapshotChain(...paths: Array<string | undefined>): RouteSnapshot {
  let current: RouteSnapshot | undefined
  for (let i = paths.length - 1; i >= 0; i--) {
    current = createSnapshot(paths[i], current ? [current] : [])
  }
  return current!
}

describe('computeRouteViewName', () => {
  it('returns / for root-only route (all empty paths)', () => {
    const root = createSnapshotChain(undefined, '')
    expect(computeRouteViewName(root)).toBe('/')
  })

  it('returns /users for simple route', () => {
    const root = createSnapshotChain(undefined, 'users')
    expect(computeRouteViewName(root)).toBe('/users')
  })

  it('returns /users/:id for parameterized route', () => {
    const root = createSnapshotChain(undefined, 'users', ':id')
    expect(computeRouteViewName(root)).toBe('/users/:id')
  })

  it('returns /users/:id/posts/:postId for deeply nested route', () => {
    const root = createSnapshotChain(undefined, 'users', ':id', 'posts', ':postId')
    expect(computeRouteViewName(root)).toBe('/users/:id/posts/:postId')
  })

  it('skips empty path wrapper routes', () => {
    // root → '' (wrapper) → users → :id
    const root = createSnapshotChain(undefined, '', 'users', ':id')
    expect(computeRouteViewName(root)).toBe('/users/:id')
  })

  it('skips multiple empty path wrappers', () => {
    // root → '' → '' → users
    const root = createSnapshotChain(undefined, '', '', 'users')
    expect(computeRouteViewName(root)).toBe('/users')
  })

  it('returns / for wildcard route', () => {
    const root = createSnapshotChain(undefined, '**')
    expect(computeRouteViewName(root)).toBe('/')
  })

  it('returns / for wildcard route after segments', () => {
    const root = createSnapshotChain(undefined, 'admin', '**')
    expect(computeRouteViewName(root)).toBe('/')
  })

  it('returns /admin/settings for lazy-loaded route (post-resolution snapshot)', () => {
    // After lazy loading, snapshot tree looks the same as non-lazy
    const root = createSnapshotChain(undefined, 'admin', 'settings')
    expect(computeRouteViewName(root)).toBe('/admin/settings')
  })

  it('excludes named outlets and follows primary outlet only', () => {
    // root has two children: primary 'users' and auxiliary 'sidebar'
    const primaryChild = createSnapshot('users', [], 'primary')
    const namedChild = createSnapshot('sidebar', [], 'sidebar')
    const root = createSnapshot(undefined, [namedChild, primaryChild])
    expect(computeRouteViewName(root)).toBe('/users')
  })

  it('handles root node with null routeConfig', () => {
    // root (null routeConfig) → users
    const usersNode = createSnapshot('users', [])
    const root = createSnapshot(undefined, [usersNode])
    expect(computeRouteViewName(root)).toBe('/users')
  })

  it('returns / when all paths are empty', () => {
    const root = createSnapshotChain(undefined, '')
    expect(computeRouteViewName(root)).toBe('/')
  })

  it('handles multi-segment path in a single route config entry', () => {
    // Angular supports path: 'users/list' in a single route config
    const root = createSnapshotChain(undefined, 'users/list')
    expect(computeRouteViewName(root)).toBe('/users/list')
  })

  it('handles root with no children', () => {
    const root = createSnapshot(undefined, [])
    expect(computeRouteViewName(root)).toBe('/')
  })
})
