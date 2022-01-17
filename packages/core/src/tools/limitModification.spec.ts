import type { Context } from './context'
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

  it('should not allow changing the type of the value on modifiable field', () => {
    const object = {
      string_to_undefined: 'bar',
      string_to_number: 'qux',

      null_to_object: null,
      object_to_null: {},

      undefined_to_object: undefined,
      object_to_undefined: {},

      array_to_object: [],
      object_to_array: {},
    }
    const modifier = (candidate: any) => {
      candidate.string_to_undefined = undefined
      candidate.string_to_number = 1234
      candidate.null_to_object = {}
      candidate.object_to_null = null
      candidate.undefined_to_object = {}
      candidate.object_to_undefined = undefined
      candidate.array_to_object = {}
      candidate.object_to_array = []
    }

    limitModification(object, Object.keys(object), modifier)

    expect(object).toEqual({
      string_to_undefined: 'bar',
      string_to_number: 'qux',

      null_to_object: null,
      object_to_null: {},

      undefined_to_object: undefined,
      object_to_undefined: {},

      array_to_object: [],
      object_to_array: {},
    })
  })

  it('should allow emptying an object by setting it to null, undefined or deleting it', () => {
    const object: any = {
      a: { foo: 'a' },
      b: { foo: 'b' },
      c: { foo: 'c' },
    }
    const modifier = (candidate: any) => {
      candidate.a = null
      candidate.b = undefined
      delete candidate.c
    }

    limitModification(object, Object.keys(object), modifier)

    expect(object).toEqual({
      a: {},
      b: {},
      c: {},
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

  it('should allow modification on sub-fields for object fields', () => {
    const object: Context = { foo: { bar: 'bar', baz: 'baz' } }
    const modifier = (candidate: any) => {
      candidate.foo.bar = { qux: 'qux' }
      delete candidate.foo.baz
    }

    limitModification(object, ['foo'], modifier)

    expect(object).toEqual({
      foo: { bar: { qux: 'qux' } },
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
})
