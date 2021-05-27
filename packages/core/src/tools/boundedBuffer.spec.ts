import { BoundedBuffer } from './boundedBuffer'

describe('BoundedBuffer', () => {
  it('collect and drain the callbacks', () => {
    const spy = jasmine.createSpy<() => void>()
    const buffered = new BoundedBuffer()

    buffered.add(spy)
    expect(spy.calls.count()).toBe(0)

    buffered.drain()
    expect(spy.calls.count()).toBe(1)

    buffered.drain()
    expect(spy.calls.count()).toBe(1)
  })

  it('store only the N last callbacks', () => {
    const spy = jasmine.createSpy<() => void>()
    const buffered = new BoundedBuffer(5)

    for (let i = 0; i < 10; i += 1) {
      buffered.add(spy)
    }

    buffered.drain()
    expect(spy.calls.count()).toEqual(5)
  })
})
