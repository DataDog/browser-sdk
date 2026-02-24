import { topologicalSort } from './dag'
import type { DagNode } from './dag'

function stubNode(overrides: Partial<DagNode> & Pick<DagNode, 'name'>): DagNode {
  return {
    provides: [],
    requires: [],
    ...overrides,
  }
}

describe('topologicalSort', () => {
  it('returns empty array for no nodes', () => {
    expect(topologicalSort([])).toEqual([])
  })

  it('returns single node as-is', () => {
    const f = stubNode({ name: 'session', provides: ['session'] })
    expect(topologicalSort([f])).toEqual([f])
  })

  it('orders nodes by dependency', () => {
    const session = stubNode({ name: 'session', provides: ['session'] })
    const view = stubNode({ name: 'view', provides: ['view'], requires: ['session'] })
    const action = stubNode({ name: 'action', provides: ['action'], requires: ['view'] })

    // Register in reverse order to prove sorting works
    const sorted = topologicalSort([action, view, session])

    const names = sorted.map((f) => f.name)
    expect(names.indexOf('session')).toBeLessThan(names.indexOf('view'))
    expect(names.indexOf('view')).toBeLessThan(names.indexOf('action'))
  })

  it('places independent nodes in deterministic (alphabetical) order', () => {
    const url = stubNode({ name: 'url', provides: ['url'] })
    const session = stubNode({ name: 'session', provides: ['session'] })
    const global = stubNode({ name: 'global', provides: ['global'] })

    const sorted = topologicalSort([url, session, global])
    const names = sorted.map((f) => f.name)
    expect(names).toEqual(['global', 'session', 'url'])
  })

  it('handles diamond dependencies', () => {
    const a = stubNode({ name: 'a', provides: ['a'] })
    const b = stubNode({ name: 'b', provides: ['b'], requires: ['a'] })
    const c = stubNode({ name: 'c', provides: ['c'], requires: ['a'] })
    const d = stubNode({ name: 'd', provides: ['d'], requires: ['b', 'c'] })

    const sorted = topologicalSort([d, c, b, a])
    const names = sorted.map((f) => f.name)

    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'))
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'))
    expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'))
  })

  it('handles a realistic multi-tier dependency graph', () => {
    const session = stubNode({ name: 'sessionDecorator', provides: ['session'] })
    const url = stubNode({ name: 'urlDecorator', provides: ['url'] })
    const view = stubNode({ name: 'viewDecorator', provides: ['view'], requires: ['session'] })
    const action = stubNode({ name: 'actionDecorator', provides: ['action'], requires: ['view'] })
    const featureFlag = stubNode({ name: 'featureFlagDecorator', provides: ['featureFlag'], requires: ['view'] })
    const global = stubNode({ name: 'globalDecorator', provides: ['global'] })

    const sorted = topologicalSort([action, featureFlag, view, url, session, global])
    const names = sorted.map((f) => f.name)

    // First tier: session, url, global (no deps)
    expect(names.indexOf('sessionDecorator')).toBeLessThan(names.indexOf('viewDecorator'))
    expect(names.indexOf('globalDecorator')).toBeLessThan(names.indexOf('viewDecorator'))

    // Second tier: view (requires session)
    expect(names.indexOf('viewDecorator')).toBeLessThan(names.indexOf('actionDecorator'))
    expect(names.indexOf('viewDecorator')).toBeLessThan(names.indexOf('featureFlagDecorator'))
  })

  it('throws on cycle', () => {
    const a = stubNode({ name: 'a', provides: ['x'], requires: ['y'] })
    const b = stubNode({ name: 'b', provides: ['y'], requires: ['x'] })

    expect(() => topologicalSort([a, b])).toThrowError(/Cycle detected among nodes.*a.*b/)
  })

  it('throws on 3-node cycle', () => {
    const a = stubNode({ name: 'a', provides: ['x'], requires: ['z'] })
    const b = stubNode({ name: 'b', provides: ['y'], requires: ['x'] })
    const c = stubNode({ name: 'c', provides: ['z'], requires: ['y'] })

    expect(() => topologicalSort([a, b, c])).toThrowError(/Cycle detected/)
  })

  it('throws on missing required key', () => {
    const f = stubNode({ name: 'a', requires: ['nonexistent'] })

    expect(() => topologicalSort([f])).toThrowError(/requires key "nonexistent" but no node provides it/)
  })

  it('throws on duplicate node name', () => {
    const a = stubNode({ name: 'dup', provides: ['x'] })
    const b = stubNode({ name: 'dup', provides: ['y'] })

    expect(() => topologicalSort([a, b])).toThrowError(/Duplicate node name: "dup"/)
  })

  it('handles a node that provides and requires the same key (self-reference)', () => {
    const f = stubNode({ name: 'self', provides: ['x'], requires: ['x'] })

    // Self-dependency is allowed (the node provides what it requires)
    const sorted = topologicalSort([f])
    expect(sorted.map((f) => f.name)).toEqual(['self'])
  })

  it('handles multiple providers for the same key', () => {
    const a = stubNode({ name: 'a', provides: ['shared'] })
    const b = stubNode({ name: 'b', provides: ['shared'] })
    const c = stubNode({ name: 'c', requires: ['shared'] })

    const sorted = topologicalSort([c, b, a])
    const names = sorted.map((f) => f.name)

    // Both a and b must run before c
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'))
  })
})
