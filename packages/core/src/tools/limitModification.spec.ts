import { limitModification } from './limitModification'

describe('limitModification', () => {
  it('should allow modifications on modifiable field', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
    }

    limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(object).toEqual({
      foo: { bar: 'modified1' },
      qux: 'modified2',
    })
  })

  it('should not allow modifications on non modifiable field', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
    }

    limitModification(object, ['foo.bar'], modifier)

    expect(object).toEqual({
      foo: { bar: 'modified1' },
      qux: 'qux',
    })
  })

  it('should not allow to add a modifiable fields not present on the original object', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
      candidate.qix = 'modified3'
    }

    limitModification(object, ['foo.bar', 'qux', 'qix'], modifier)

    expect(object).toEqual({
      foo: { bar: 'modified1' },
      qux: 'modified2',
    })
  })

  it('should not allow non string value on modifiable field', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.foo.bar = undefined
      candidate.qux = 1234
    }

    limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(object).toEqual({
      foo: { bar: 'bar' },
      qux: 'qux',
    })
  })

  it('should not allow structural change of the object', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.foo.bar = { qux: 'qux' }
      candidate.bar = 'bar'
      delete candidate.qux
    }

    limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(object).toEqual({
      foo: { bar: 'bar' },
      qux: 'qux',
    })
  })

  it('should return the result of the modifier', () => {
    const object = { foo: { bar: 'bar' } }
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'qux'
      return false
    }

    const result = limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(result).toBe(false)
    expect(object).toEqual({
      foo: { bar: 'qux' },
    })
  })

  it('should catch and log modifier exception', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.qux = 'modified'
      candidate.foo.qux.bar = 'will throw'
    }
    const errorSpy = spyOn(console, 'error')

    limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(errorSpy).toHaveBeenCalled()
    expect(object).toEqual({
      foo: { bar: 'bar' },
      qux: 'qux',
    })
  })
})
