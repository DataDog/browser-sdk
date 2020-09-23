import { createBufferedFunction } from '../src/bufferedFunction'

describe('createBufferedFunction', () => {
  it('does not call the wrapped function until enabled() is called', () => {
    const spy = jasmine.createSpy<(i: number) => void>()
    const buffered = createBufferedFunction(spy)

    buffered(1)
    expect(spy).not.toHaveBeenCalled()

    buffered.enable()
    expect(spy.calls.all().length).toBe(1)
    expect(spy.calls.first().args).toEqual([1])
  })

  it('replay only the N last calls', () => {
    const spy = jasmine.createSpy<(i: number) => void>()
    const buffered = createBufferedFunction(spy, 5)

    for (let i = 0; i < 10; i += 1) {
      buffered(i)
    }

    buffered.enable()
    expect(spy.calls.allArgs()).toEqual([[5], [6], [7], [8], [9]])
  })

  it('runs the function directly once enabled', () => {
    const spy = jasmine.createSpy<(i: number) => void>()
    const buffered = createBufferedFunction(spy)
    buffered.enable()
    buffered(1)
    expect(spy.calls.all().length).toBe(1)
    expect(spy.calls.first().args).toEqual([1])
  })
})
