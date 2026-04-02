import type { AnyEnricher } from './factory'
import { topologicalSort } from './topologicalSort'

function stubEnricher(overrides: Partial<AnyEnricher> & Pick<AnyEnricher, 'name'>): AnyEnricher {
  return {
    transform: (data: unknown) => data,
    ...overrides,
  }
}

describe('topologicalSort', () => {
  it('returns empty array for no enrichers', () => {
    expect(topologicalSort([])).toEqual([])
  })

  it('returns single enricher as-is', () => {
    const f = stubEnricher({ name: 'session' })
    expect(topologicalSort([f])).toEqual([f])
  })

  it('orders enrichers by dependency', () => {
    const session = stubEnricher({ name: 'session' })
    const view = stubEnricher({ name: 'view', requires: [session] })
    const action = stubEnricher({ name: 'action', requires: [view] })

    const sorted = topologicalSort([action, view, session])

    const names = sorted.map((f) => f.name)
    expect(names.indexOf('session')).toBeLessThan(names.indexOf('view'))
    expect(names.indexOf('view')).toBeLessThan(names.indexOf('action'))
  })

  it('places independent enrichers in deterministic (alphabetical) order', () => {
    const url = stubEnricher({ name: 'url' })
    const session = stubEnricher({ name: 'session' })
    const global = stubEnricher({ name: 'global' })

    const sorted = topologicalSort([url, session, global])
    const names = sorted.map((f) => f.name)
    expect(names).toEqual(['global', 'session', 'url'])
  })

  it('handles diamond dependencies', () => {
    const a = stubEnricher({ name: 'a' })
    const b = stubEnricher({ name: 'b', requires: [a] })
    const c = stubEnricher({ name: 'c', requires: [a] })
    const d = stubEnricher({ name: 'd', requires: [b, c] })

    const sorted = topologicalSort([d, c, b, a])
    const names = sorted.map((f) => f.name)

    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'))
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'))
    expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'))
  })

  it('handles a realistic multi-tier dependency graph', () => {
    const session = stubEnricher({ name: 'session' })
    const url = stubEnricher({ name: 'url' })
    const view = stubEnricher({ name: 'view', requires: [session] })
    const action = stubEnricher({ name: 'action', requires: [view] })
    const featureFlag = stubEnricher({ name: 'featureFlag', requires: [view] })
    const global = stubEnricher({ name: 'global' })

    const sorted = topologicalSort([action, featureFlag, view, url, session, global])
    const names = sorted.map((f) => f.name)

    expect(names.indexOf('session')).toBeLessThan(names.indexOf('view'))
    expect(names.indexOf('global')).toBeLessThan(names.indexOf('view'))
    expect(names.indexOf('view')).toBeLessThan(names.indexOf('action'))
    expect(names.indexOf('view')).toBeLessThan(names.indexOf('featureFlag'))
  })

  it('throws on cycle', () => {
    const a = stubEnricher({ name: 'a' })
    const b = stubEnricher({ name: 'b' })
    a.requires = [b]
    b.requires = [a]

    expect(() => topologicalSort([a, b])).toThrowError(/Cycle detected among enrichers.*a.*b/)
  })

  it('throws on 3-node cycle', () => {
    const a = stubEnricher({ name: 'a' })
    const b = stubEnricher({ name: 'b' })
    const c = stubEnricher({ name: 'c' })
    a.requires = [c]
    b.requires = [a]
    c.requires = [b]

    expect(() => topologicalSort([a, b, c])).toThrowError(/Cycle detected/)
  })

  it('throws on missing required enricher', () => {
    const missing = stubEnricher({ name: 'nonexistent' })
    const f = stubEnricher({ name: 'a', requires: [missing] })

    expect(() => topologicalSort([f])).toThrowError(/requires "nonexistent" but no enricher with that name exists/)
  })

  it('throws on duplicate enricher name', () => {
    const a = stubEnricher({ name: 'dup' })
    const b = stubEnricher({ name: 'dup' })

    expect(() => topologicalSort([a, b])).toThrowError(/Duplicate enricher name: "dup"/)
  })

  it('throws on self-reference in requires', () => {
    const f = stubEnricher({ name: 'self' })
    f.requires = [f]

    expect(() => topologicalSort([f])).toThrowError(/cannot require itself/)
  })

  it('handles enrichers without requires', () => {
    const a = stubEnricher({ name: 'a' })
    const b = stubEnricher({ name: 'b' })
    const c = stubEnricher({ name: 'c', requires: [b] })

    const sorted = topologicalSort([c, a, b])
    const names = sorted.map((f) => f.name)

    expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'))
  })
})
