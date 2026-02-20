import { resolveDecoratorOrder } from './decoratorDag'
import { stubFactory } from './testUtils'

describe('resolveDecoratorOrder', () => {
  it('returns empty array for no factories', () => {
    expect(resolveDecoratorOrder([])).toEqual([])
  })

  it('returns single factory as-is', () => {
    const f = stubFactory({ name: 'session', provides: ['session'] })
    expect(resolveDecoratorOrder([f])).toEqual([f])
  })

  it('orders factories by dependency', () => {
    const session = stubFactory({ name: 'session', provides: ['session'] })
    const view = stubFactory({ name: 'view', provides: ['view'], requires: ['session'] })
    const action = stubFactory({ name: 'action', provides: ['action'], requires: ['view'] })

    // Register in reverse order to prove sorting works
    const sorted = resolveDecoratorOrder([action, view, session])

    const names = sorted.map((f) => f.name)
    expect(names.indexOf('session')).toBeLessThan(names.indexOf('view'))
    expect(names.indexOf('view')).toBeLessThan(names.indexOf('action'))
  })

  it('places independent decorators in deterministic (alphabetical) order', () => {
    const url = stubFactory({ name: 'url', provides: ['url'] })
    const session = stubFactory({ name: 'session', provides: ['session'] })
    const global = stubFactory({ name: 'global', provides: ['global'] })

    const sorted = resolveDecoratorOrder([url, session, global])
    const names = sorted.map((f) => f.name)
    expect(names).toEqual(['global', 'session', 'url'])
  })

  it('handles diamond dependencies', () => {
    const a = stubFactory({ name: 'a', provides: ['a'] })
    const b = stubFactory({ name: 'b', provides: ['b'], requires: ['a'] })
    const c = stubFactory({ name: 'c', provides: ['c'], requires: ['a'] })
    const d = stubFactory({ name: 'd', provides: ['d'], requires: ['b', 'c'] })

    const sorted = resolveDecoratorOrder([d, c, b, a])
    const names = sorted.map((f) => f.name)

    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'))
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'))
    expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'))
  })

  it('resolves the example from the design document', () => {
    const session = stubFactory({ name: 'sessionDecorator', provides: ['session'] })
    const url = stubFactory({ name: 'urlDecorator', provides: ['url'] })
    const view = stubFactory({ name: 'viewDecorator', provides: ['view'], requires: ['session'] })
    const action = stubFactory({ name: 'actionDecorator', provides: ['action'], requires: ['view'] })
    const featureFlag = stubFactory({ name: 'featureFlagDecorator', provides: ['featureFlag'], requires: ['view'] })
    const global = stubFactory({ name: 'globalDecorator', provides: ['global'] })

    const sorted = resolveDecoratorOrder([action, featureFlag, view, url, session, global])
    const names = sorted.map((f) => f.name)

    // First tier: session, url, global (no deps)
    expect(names.indexOf('sessionDecorator')).toBeLessThan(names.indexOf('viewDecorator'))
    expect(names.indexOf('globalDecorator')).toBeLessThan(names.indexOf('viewDecorator'))

    // Second tier: view (requires session)
    expect(names.indexOf('viewDecorator')).toBeLessThan(names.indexOf('actionDecorator'))
    expect(names.indexOf('viewDecorator')).toBeLessThan(names.indexOf('featureFlagDecorator'))
  })

  it('throws on cycle', () => {
    const a = stubFactory({ name: 'a', provides: ['x'], requires: ['y'] })
    const b = stubFactory({ name: 'b', provides: ['y'], requires: ['x'] })

    expect(() => resolveDecoratorOrder([a, b])).toThrowError(/Cycle detected among decorators.*a.*b/)
  })

  it('throws on 3-node cycle', () => {
    const a = stubFactory({ name: 'a', provides: ['x'], requires: ['z'] })
    const b = stubFactory({ name: 'b', provides: ['y'], requires: ['x'] })
    const c = stubFactory({ name: 'c', provides: ['z'], requires: ['y'] })

    expect(() => resolveDecoratorOrder([a, b, c])).toThrowError(/Cycle detected/)
  })

  it('throws on missing required key', () => {
    const f = stubFactory({ name: 'a', requires: ['nonexistent'] })

    expect(() => resolveDecoratorOrder([f])).toThrowError(/requires key "nonexistent" but no decorator provides it/)
  })

  it('throws on duplicate decorator name', () => {
    const a = stubFactory({ name: 'dup', provides: ['x'] })
    const b = stubFactory({ name: 'dup', provides: ['y'] })

    expect(() => resolveDecoratorOrder([a, b])).toThrowError(/Duplicate decorator name: "dup"/)
  })

  it('handles a decorator that provides and requires the same key (self-reference)', () => {
    const f = stubFactory({ name: 'self', provides: ['x'], requires: ['x'] })

    // Self-dependency is allowed (the decorator provides what it requires)
    const sorted = resolveDecoratorOrder([f])
    expect(sorted.map((f) => f.name)).toEqual(['self'])
  })

  it('handles multiple providers for the same key', () => {
    const a = stubFactory({ name: 'a', provides: ['shared'] })
    const b = stubFactory({ name: 'b', provides: ['shared'] })
    const c = stubFactory({ name: 'c', requires: ['shared'] })

    const sorted = resolveDecoratorOrder([c, b, a])
    const names = sorted.map((f) => f.name)

    // Both a and b must run before c
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'))
  })
})
