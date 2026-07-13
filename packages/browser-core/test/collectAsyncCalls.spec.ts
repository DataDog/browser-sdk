import { describe, expect, it, vi } from 'vitest'
import { collectAsyncCalls } from './collectAsyncCalls'

describe('collectAsyncCalls', () => {
  it('collects calls and preserves the mock implementation return value', async () => {
    const spy = vi.fn((value: number) => value * 2)
    const callsPromise = collectAsyncCalls(spy)

    expect(spy(21)).toBe(42)

    const calls = await callsPromise
    expect(calls.count()).toBe(1)
    expect(calls.mostRecent()).toEqual({ args: [21], returnValue: 42 })
  })

  it('does not swallow errors from the mock implementation', async () => {
    const expectedError = new Error('original error')
    const spy = vi.fn(() => {
      throw expectedError
    })
    const callsPromise = collectAsyncCalls(spy)

    expect(() => spy()).toThrow(expectedError)
    await expect(callsPromise).resolves.toBeDefined()
  })

  it('throws on an extra call after the expected calls were collected', async () => {
    const spy = vi.fn<() => void>()
    const callsPromise = collectAsyncCalls(spy)
    spy()
    await callsPromise

    expect(() => spy()).toThrow('Unexpected call count (expected 1, got 2)')
    spy.mockClear()
  })

  it('can collect the same mock again', async () => {
    const spy = vi.fn<() => void>()
    const firstCalls = collectAsyncCalls(spy)
    spy()
    await firstCalls

    spy.mockClear()
    const secondCalls = collectAsyncCalls(spy)
    spy()

    await expect(secondCalls).resolves.toBeDefined()
  })
})
