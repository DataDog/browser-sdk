import { createLruCache } from './lruCache'

describe('LruCache', () => {
  let lengthCache: ReturnType<typeof createLruCache<string, number>>
  let getLength: jasmine.Func

  beforeEach(() => {
    lengthCache = createLruCache(5)
    getLength = jasmine.createSpy('mockFunction').and.callFake((str: string) => str.length)
  })

  it('sets cache entry', () => {
    lengthCache.set('foo', getLength('foo'))
    expect(lengthCache.get('foo')).toEqual(3)
  })

  it('checks if there is cache entry', () => {
    lengthCache.set('foo', getLength('foo'))
    expect(lengthCache.has('foo')).toEqual(true)
    expect(lengthCache.has('bar')).toEqual(false)
  })

  it('deletes cache entry', () => {
    lengthCache.set('foo', getLength('foo'))
    expect(lengthCache.has('foo')).toEqual(true)
    expect(lengthCache.get('foo')).toEqual(3)

    lengthCache.delete('foo')
    expect(lengthCache.has('foo')).toEqual(false)
    expect(lengthCache.get('foo')).toEqual(undefined)
  })

  it('looks-up cache entry', () => {
    expect(lengthCache.lookup('foo', getLength)).toEqual(3)
    expect(getLength).toHaveBeenCalledTimes(1)
    expect(getLength).toHaveBeenCalledWith('foo')

    expect(lengthCache.lookup('foo', getLength)).toEqual(3)
    expect(getLength).toHaveBeenCalledTimes(1)

    expect(lengthCache.lookup('barr', getLength)).toEqual(4)
    expect(getLength).toHaveBeenCalledTimes(2)

    expect(lengthCache.lookup('barr', getLength)).toEqual(4)
    expect(getLength).toHaveBeenCalledTimes(2)

    expect(lengthCache.lookup('foo', getLength)).toEqual(3)
    expect(getLength).toHaveBeenCalledTimes(2)

    expect(lengthCache.lookup('baz', getLength)).toEqual(3)
    expect(getLength).toHaveBeenCalledTimes(3)
  })

  it('keeps only 5 last-recently used items', () => {
    // add 6 items to overflow the cache
    lengthCache.set('foo1', getLength('foo1'))
    lengthCache.set('foo2', getLength('foo2'))
    lengthCache.set('foo3', getLength('foo3'))
    lengthCache.set('foo4', getLength('foo4'))
    lengthCache.set('foo5', getLength('foo5'))
    lengthCache.set('foo6', getLength('foo6'))

    // we should drop the oldest entry
    expect(lengthCache.has('foo1')).toEqual(false)
    expect(lengthCache.has('foo2')).toEqual(true)
    expect(lengthCache.has('foo3')).toEqual(true)
    expect(lengthCache.has('foo4')).toEqual(true)
    expect(lengthCache.has('foo5')).toEqual(true)
    expect(lengthCache.has('foo6')).toEqual(true)

    // get foo3 and foo4 to bump it in the hierarchy
    expect(lengthCache.get('foo3')).toEqual(4)
    expect(lengthCache.get('foo4')).toEqual(4)

    // add another items
    lengthCache.set('foo7', getLength('foo7'))
    lengthCache.set('foo8', getLength('foo8'))
    lengthCache.set('foo9', getLength('foo9'))

    // we should drop another entries
    expect(lengthCache.has('foo1')).toEqual(false)
    expect(lengthCache.has('foo2')).toEqual(false)
    expect(lengthCache.has('foo3')).toEqual(true)
    expect(lengthCache.has('foo4')).toEqual(true)
    expect(lengthCache.has('foo5')).toEqual(false)
    expect(lengthCache.has('foo6')).toEqual(false)
    expect(lengthCache.has('foo7')).toEqual(true)
    expect(lengthCache.has('foo8')).toEqual(true)
    expect(lengthCache.has('foo9')).toEqual(true)

    // get foo4 and foo7 to bump it again
    expect(lengthCache.get('foo4')).toEqual(4)
    expect(lengthCache.get('foo7')).toEqual(4)

    // add another items
    lengthCache.set('foo10', getLength('foo10'))
    lengthCache.set('foo11', getLength('foo11'))
    lengthCache.set('foo12', getLength('foo12'))

    // we should drop another entries
    expect(lengthCache.has('foo1')).toEqual(false)
    expect(lengthCache.has('foo2')).toEqual(false)
    expect(lengthCache.has('foo3')).toEqual(false)
    expect(lengthCache.has('foo4')).toEqual(true)
    expect(lengthCache.has('foo5')).toEqual(false)
    expect(lengthCache.has('foo6')).toEqual(false)
    expect(lengthCache.has('foo7')).toEqual(true)
    expect(lengthCache.has('foo8')).toEqual(false)
    expect(lengthCache.has('foo9')).toEqual(false)
    expect(lengthCache.has('foo10')).toEqual(true)
    expect(lengthCache.has('foo11')).toEqual(true)
    expect(lengthCache.has('foo12')).toEqual(true)
  })

  it('clears the cache', () => {
    // add 3 items
    lengthCache.set('foo1', getLength('foo1'))
    lengthCache.set('foo2', getLength('foo2'))
    lengthCache.set('foo3', getLength('foo3'))

    expect(lengthCache.has('foo1')).toEqual(true)
    expect(lengthCache.has('foo2')).toEqual(true)
    expect(lengthCache.has('foo3')).toEqual(true)

    // clear the cache
    lengthCache.clear()

    expect(lengthCache.has('foo1')).toEqual(false)
    expect(lengthCache.has('foo2')).toEqual(false)
    expect(lengthCache.has('foo3')).toEqual(false)
  })
})
