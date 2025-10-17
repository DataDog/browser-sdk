/**
 * Jasmine-compatible Custom Matchers for Vitest
 * 
 * This module provides Jasmine matchers that don't exist in Vitest by default.
 * Use expect.extend() to register these matchers.
 * 
 * Usage:
 * ```typescript
 * import { expect } from 'vitest'
 * import { jasmineMatchers } from '@datadog/browser-core/mock/jasmineMatchers'
 * 
 * expect.extend(jasmineMatchers)
 * ```
 */

import { expect } from 'vitest'
import type { ExpectationResult, MatcherState } from '@vitest/expect'
import type { MockInstance } from 'vitest'

// Type definitions for custom matchers
interface CustomMatchers<R = unknown> {
  toHaveBeenCalledOnceWith(...args: any[]): R
  toHaveBeenCalledBefore(other: MockInstance): R
  toBeTrue(): R
  toBeFalse(): R
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

/**
 * Custom Jasmine-compatible matchers for Vitest
 */
export const jasmineMatchers = {
  /**
   * Checks if a mock function was called exactly once with the specified arguments
   * 
   * @example
   * const spy = vi.fn()
   * spy('hello', 'world')
   * expect(spy).toHaveBeenCalledOnceWith('hello', 'world')
   */
  toHaveBeenCalledOnceWith(
    this: MatcherState,
    received: MockInstance,
    ...expectedArgs: any[]
  ): ExpectationResult {
    const { isNot, equals, utils } = this

    const receivedCalls = received.mock.calls
    const callCount = receivedCalls.length

    if (callCount !== 1) {
      return {
        pass: false,
        message: () => {
          const hint = utils.matcherHint(
            'toHaveBeenCalledOnceWith',
            'received',
            'expected',
            { isNot, promise: this.promise }
          )
          return (
            hint +
            '\n\n' +
            `Expected the spy to have been called exactly once, but it was called ${callCount} times.\n` +
            (callCount > 0
              ? `\nActual calls:\n${receivedCalls.map((call, i) => `  ${i + 1}. ${utils.stringify(call)}`).join('\n')}`
              : '')
          )
        },
      }
    }

    const actualArgs = receivedCalls[0]
    const pass = equals(actualArgs, expectedArgs)

    return {
      pass,
      message: () => {
        const hint = utils.matcherHint(
          'toHaveBeenCalledOnceWith',
          'received',
          'expected',
          { isNot, promise: this.promise }
        )

        if (pass && isNot) {
          return (
            hint +
            '\n\n' +
            `Expected the spy not to have been called once with:\n` +
            `  ${utils.printExpected(expectedArgs)}\n` +
            `But it was called with:\n` +
            `  ${utils.printReceived(actualArgs)}`
          )
        }

        return (
          hint +
          '\n\n' +
          `Expected the spy to have been called once with:\n` +
          `  ${utils.printExpected(expectedArgs)}\n` +
          `But it was called with:\n` +
          `  ${utils.printReceived(actualArgs)}\n\n` +
          utils.diff(expectedArgs, actualArgs)
        )
      },
    }
  },

  /**
   * Checks if a mock function was called before another mock function
   * 
   * @example
   * const spy1 = vi.fn()
   * const spy2 = vi.fn()
   * spy1()
   * spy2()
   * expect(spy1).toHaveBeenCalledBefore(spy2)
   */
  toHaveBeenCalledBefore(
    this: MatcherState,
    received: MockInstance,
    other: MockInstance
  ): ExpectationResult {
    const { isNot, utils } = this

    if (!received.mock.invocationCallOrder || !other.mock.invocationCallOrder) {
      return {
        pass: false,
        message: () =>
          utils.matcherHint('toHaveBeenCalledBefore') +
          '\n\n' +
          'One or both spies have no invocation call order information.',
      }
    }

    const receivedCallOrder = received.mock.invocationCallOrder
    const otherCallOrder = other.mock.invocationCallOrder

    if (receivedCallOrder.length === 0) {
      return {
        pass: false,
        message: () =>
          utils.matcherHint('toHaveBeenCalledBefore', 'received', 'other', { isNot }) +
          '\n\n' +
          'Expected spy was not called.',
      }
    }

    if (otherCallOrder.length === 0) {
      return {
        pass: false,
        message: () =>
          utils.matcherHint('toHaveBeenCalledBefore', 'received', 'other', { isNot }) +
          '\n\n' +
          'Other spy was not called.',
      }
    }

    const receivedFirstCall = Math.min(...receivedCallOrder)
    const otherFirstCall = Math.min(...otherCallOrder)
    const pass = receivedFirstCall < otherFirstCall

    return {
      pass,
      message: () => {
        const hint = utils.matcherHint('toHaveBeenCalledBefore', 'received', 'other', {
          isNot,
          promise: this.promise,
        })

        if (pass && isNot) {
          return (
            hint +
            '\n\n' +
            `Expected first spy not to have been called before second spy.\n` +
            `First spy was called at: ${receivedFirstCall}\n` +
            `Second spy was called at: ${otherFirstCall}`
          )
        }

        return (
          hint +
          '\n\n' +
          `Expected first spy to have been called before second spy.\n` +
          `First spy was called at: ${receivedFirstCall}\n` +
          `Second spy was called at: ${otherFirstCall}`
        )
      },
    }
  },

  /**
   * Checks if a value is exactly `true` (not just truthy)
   * 
   * @example
   * expect(true).toBeTrue()
   * expect(1).toBeTrue() // fails - not exactly true
   */
  toBeTrue(this: MatcherState, received: any): ExpectationResult {
    const { isNot, utils } = this

    const pass = received === true

    return {
      pass,
      message: () => {
        const hint = utils.matcherHint('toBeTrue', 'received', '', {
          isNot,
          promise: this.promise,
        })

        if (pass && isNot) {
          return (
            hint +
            '\n\n' +
            `Expected value not to be true, but received:\n` +
            `  ${utils.printReceived(received)}`
          )
        }

        return (
          hint +
          '\n\n' +
          `Expected value to be exactly true, but received:\n` +
          `  ${utils.printReceived(received)}\n\n` +
          `Note: Use .toBeTruthy() if you want to check for any truthy value.`
        )
      },
    }
  },

  /**
   * Checks if a value is exactly `false` (not just falsy)
   * 
   * @example
   * expect(false).toBeFalse()
   * expect(0).toBeFalse() // fails - not exactly false
   */
  toBeFalse(this: MatcherState, received: any): ExpectationResult {
    const { isNot, utils } = this

    const pass = received === false

    return {
      pass,
      message: () => {
        const hint = utils.matcherHint('toBeFalse', 'received', '', {
          isNot,
          promise: this.promise,
        })

        if (pass && isNot) {
          return (
            hint +
            '\n\n' +
            `Expected value not to be false, but received:\n` +
            `  ${utils.printReceived(received)}`
          )
        }

        return (
          hint +
          '\n\n' +
          `Expected value to be exactly false, but received:\n` +
          `  ${utils.printReceived(received)}\n\n` +
          `Note: Use .toBeFalsy() if you want to check for any falsy value.`
        )
      },
    }
  },
}

/**
 * Utility function to set up all Jasmine matchers at once
 * Call this in your test setup file or at the beginning of test files
 */
export function setupJasmineMatchers() {
  expect.extend(jasmineMatchers)
}
