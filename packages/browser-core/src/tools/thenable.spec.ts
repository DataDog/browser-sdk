import { isThenable, waitForThenable, TIMEOUT_ERROR_MESSAGE } from './thenable'
import { noop } from './utils/functionUtils'

describe('isThenable', () => {
  it('returns true for a Promise', () => {
    expect(isThenable(Promise.resolve())).toBe(true)
  })

  it('returns true for a plain object with a then function', () => {
    expect(isThenable({ then: noop })).toBe(true)
  })

  it('returns false for a plain object without a then function', () => {
    expect(isThenable({})).toBe(false)
  })

  it('returns false for null and undefined', () => {
    expect(isThenable(null)).toBe(false)
    expect(isThenable(undefined)).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isThenable(42)).toBe(false)
    expect(isThenable('foo')).toBe(false)
  })
})

describe('waitForThenable', () => {
  it('resolves with the thenable value when it settles before the timeout', async () => {
    const result = await waitForThenable(Promise.resolve('value'), 1000)
    expect(result).toBe('value')
  })

  it('rejects with the thenable rejection reason when it settles before the timeout', async () => {
    await expectAsync(waitForThenable(Promise.reject(new Error('boom')), 1000)).toBeRejectedWithError('boom')
  })

  it('rejects with a timeout error when the thenable does not settle in time', async () => {
    const neverSettles = new Promise(noop)
    await expectAsync(waitForThenable(neverSettles, 0)).toBeRejectedWithError(TIMEOUT_ERROR_MESSAGE)
  })
})
