import { isErrorLike } from './isError'

describe('isErrorLike', () => {
  it('accepts Error instances and objects with optional string fields', () => {
    ;[
      new Error('message'),
      { message: '' },
      { message: 'message', name: 'TypeError' },
      { message: 'message', stack: 'stack' },
      { message: 'message', name: undefined, stack: undefined },
    ].forEach((value) => {
      expect(isErrorLike(value)).toBe(true)
    })
  })

  it('rejects values that do not match the error-like shape', () => {
    ;[
      null,
      undefined,
      'message',
      {},
      { message: 42 },
      { message: 'message', name: 42 },
      { message: 'message', stack: {} },
    ].forEach((value) => {
      expect(isErrorLike(value)).toBe(false)
    })
  })
})
