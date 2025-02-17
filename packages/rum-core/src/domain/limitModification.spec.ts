import type { Context } from '@datadog/browser-core'
import { objectEntries } from '@datadog/browser-core'
import type { ModifiableFieldPaths } from './limitModification'
import { limitModification } from './limitModification'

describe('limitModification', () => {
  let object: unknown

  beforeEach(() => {
    object = {
      foo: { bar: 'bar' },
      arr: [{ foo: 'foo' }],
      qux: 'qux',
    }
  })

  it('should allow modifications on modifiable field', () => {
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
      candidate.arr[0].foo = 'modified3'
    }

    limitModification(
      object,
      {
        'foo.bar': 'string',
        qux: 'string',
        'arr[].foo': 'string',
      },
      modifier
    )

    expect(object).toEqual({
      foo: { bar: 'modified1' },
      qux: 'modified2',
      arr: [{ foo: 'modified3' }],
    })
  })

  it('should not allow modifications on non modifiable field', () => {
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
      candidate.arr[0].foo = 'modified3'
    }

    limitModification(object, { 'foo.bar': 'string' }, modifier)

    expect(object).toEqual({
      foo: { bar: 'modified1' },
      arr: [{ foo: 'foo' }],
      qux: 'qux',
    })
  })

  it('should allow to add a modifiable fields not present on the original object', () => {
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
      candidate.qix = 'modified3'
    }

    limitModification(object, { 'foo.bar': 'string', qux: 'string', qix: 'string' }, modifier)

    expect(object as any).toEqual({
      foo: { bar: 'modified1' },
      arr: [{ foo: 'foo' }],
      qux: 'modified2',
      qix: 'modified3',
    })
  })

  it('should not allow to add a non modifiable fields not present on the original object', () => {
    const modifier = (candidate: any) => {
      candidate.foo.bar = 'modified1'
      candidate.qux = 'modified2'
      candidate.qix = 'modified3'
    }

    limitModification(object, { 'foo.bar': 'string', qux: 'string' }, modifier)

    expect(object).toEqual({
      foo: { bar: 'modified1' },
      arr: [{ foo: 'foo' }],
      qux: 'modified2',
    })
  })

  it('should not allow changing the type of the value on modifiable field', () => {
    const object = {
      string_to_undefined: 'bar',
      string_to_number: 'qux',

      object_to_null: {},
      object_to_undefined: {},
      object_to_array: {},
    }
    const modifier = (candidate: any) => {
      candidate.string_to_undefined = undefined
      candidate.string_to_number = 1234

      candidate.object_to_null = null
      candidate.object_to_undefined = undefined
      candidate.object_to_array = []
    }

    limitModification(object, generateModifiableFieldPathsFrom(object), modifier)

    expect(object).toEqual({
      string_to_undefined: 'bar',
      string_to_number: 'qux',

      object_to_null: {},
      object_to_undefined: {},
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

    limitModification(object, generateModifiableFieldPathsFrom(object), modifier)

    expect(object).toEqual({
      a: {},
      b: {},
      c: {},
    })
  })

  it('should not allow structural change of the object', () => {
    const modifier = (candidate: any) => {
      candidate.foo.bar = { qux: 'qux' }
      candidate.bar = 'bar'
      delete candidate.qux
      ;(candidate.arr as Array<Record<string, string>>).push({ bar: 'baz' })
    }

    limitModification(object, { 'foo.bar': 'string', qux: 'string' }, modifier)

    expect(object).toEqual({
      foo: { bar: 'bar' },
      qux: 'qux',
      arr: [{ foo: 'foo' }],
    })
  })

  it('should allow modification on sub-fields for object fields', () => {
    const object: Context = { foo: { bar: 'bar', baz: 'baz' } }
    const modifier = (candidate: any) => {
      candidate.foo.bar = { qux: 'qux' }
      delete candidate.foo.baz
    }

    limitModification(object, { foo: 'object' }, modifier)

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

    const result = limitModification(object, { 'foo.bar': 'string', qux: 'string' }, modifier)

    expect(result).toBe(false)
    expect(object).toEqual({
      foo: { bar: 'qux' },
    })
  })

  it('should call sanitize on newly provided values', () => {
    const object: Context = { bar: { baz: 42 } }

    const modifier = (candidate: any) => {
      candidate.bar.self = candidate.bar
    }

    limitModification(object, { bar: 'object' }, modifier)
    expect(() => JSON.stringify(object)).not.toThrowError()
  })
})

function generateModifiableFieldPathsFrom(object: Record<string, string | object>) {
  const modifiableFieldPaths: ModifiableFieldPaths = {}
  objectEntries(object).forEach(([key, value]) => {
    modifiableFieldPaths[key] = typeof value as 'object' | 'string'
  })
  return modifiableFieldPaths
}
