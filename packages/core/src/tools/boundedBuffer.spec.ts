import { createBoundedBuffer } from './boundedBuffer'

describe('BoundedBuffer', () => {
  it('collect and drain the callbacks', () => {
    const spy = jasmine.createSpy<() => void>()
    const buffered = createBoundedBuffer()

    buffered.add(spy)
    expect(spy.calls.count()).toBe(0)

    buffered.drain()
    expect(spy.calls.count()).toBe(1)

    buffered.drain()
    expect(spy.calls.count()).toBe(1)
  })

  it('store at most 500 callbacks', () => {
    const spy = jasmine.createSpy<() => void>()
    const buffered = createBoundedBuffer()
    const limit = 500

    for (let i = 0; i < limit + 1; i += 1) {
      buffered.add(spy)
    }

    buffered.drain()
    expect(spy.calls.count()).toEqual(limit)
  })

  it('removes a callback', () => {
    const spy = jasmine.createSpy<() => void>()
    const buffered = createBoundedBuffer()

    buffered.add(spy)
    buffered.remove(spy)
    buffered.drain()
    expect(spy).not.toHaveBeenCalled()
  })
})
