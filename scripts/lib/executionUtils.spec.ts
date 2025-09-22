import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findError } from './executionUtils.ts'

describe('findError', () => {
  it('finds the provided error', () => {
    const error = new Error('foo')
    assert.equal(findError(error, Error), error)
  })

  it('finds an error in the cause chain', () => {
    class MyError extends Error {}
    const cause = new MyError('foo')
    const error = new Error('bar', { cause })
    assert.equal(findError(error, MyError), cause)
  })
})
