import { limitModification } from './limitModification'

/* eslint-disable  */
describe('limitModification', () => {
  it('should allow modifications on modifiable field', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
    }

    const result = limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(result).toEqual({
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

    const result = limitModification(object, ['foo.bar'], modifier)

    expect(result).toEqual({
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

    const result = limitModification(object, ['foo.bar', 'qux', 'qix'], modifier)

    expect(result).toEqual({
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

    const result = limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(result).toEqual({
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

    const result = limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(result).toEqual({
      foo: { bar: 'bar' },
      qux: 'qux',
    })
  })

  it('should catch and log modifier exception', () => {
    const object = { foo: { bar: 'bar' }, qux: 'qux' }
    const modifier = (candidate: any) => {
      candidate.qux = 'modified'
      candidate.foo.qux.bar = 'will throw'
    }
    const errorSpy = spyOn(console, 'error')

    const result = limitModification(object, ['foo.bar', 'qux'], modifier)

    expect(errorSpy).toHaveBeenCalled()
    expect(result).toEqual({
      foo: { bar: 'bar' },
      qux: 'qux',
    })
  })
})
