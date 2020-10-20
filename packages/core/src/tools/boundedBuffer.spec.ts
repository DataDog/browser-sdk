import { BoundedBuffer } from './boundedBuffer'

describe('BoundedBuffer', () => {
  it('collect and drain the items', () => {
    const spy = jasmine.createSpy<(i: number) => void>()
    const buffered = new BoundedBuffer<number>()

    buffered.add(1)
    buffered.drain(spy)
    expect(spy.calls.count()).toBe(1)
    expect(spy.calls.first().args).toEqual([1])

    buffered.drain(spy)
    expect(spy.calls.count()).toBe(1)
  })

  it('store only the N last items', () => {
    const spy = jasmine.createSpy<(i: number) => void>()
    const buffered = new BoundedBuffer<number>(5)

    for (let i = 0; i < 10; i += 1) {
      buffered.add(i)
    }

    buffered.drain(spy)
    expect(spy.calls.allArgs()).toEqual([[5], [6], [7], [8], [9]])
  })
})
