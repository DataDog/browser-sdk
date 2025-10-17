/**
 * Jasmine to Vitest Adapter
 * 
 * This module provides a compatibility layer that maps Jasmine APIs to their Vitest equivalents.
 * This allows gradual migration of test files without having to rewrite all test code at once.
 * 
 * Usage in test files:
 * ```typescript
 * import { jasmine, spyOn, spyOnProperty } from '@datadog/browser-core/mock/jasmineAdapter'
 * ```
 */

import { vi, type MockInstance } from 'vitest'

// ============================================================================
// Spy Creation
// ============================================================================

/**
 * Creates a spy function (equivalent to jasmine.createSpy)
 * @param name Optional name for the spy
 * @returns A Vitest mock function
 */
function createSpy<T extends (...args: any[]) => any = any>(name?: string): MockInstance<T> {
  return vi.fn<T>() as MockInstance<T>
}

/**
 * Creates a spy on an object's method (equivalent to Jasmine's spyOn)
 * @param obj The object containing the method
 * @param methodName The name of the method to spy on
 * @returns A Vitest spy with Jasmine-compatible API
 */
export function spyOn<T extends object, K extends keyof T>(
  obj: T,
  methodName: K
): JasmineSpy<T[K] extends (...args: any[]) => any ? T[K] : never> {
  // In Vitest, vi.spyOn mocks by default. In Jasmine, spyOn calls through by default.
  // We need to match Jasmine's behavior by calling mockImplementation with the original.
  const original = (obj as any)[methodName]
  let spy: MockInstance<any>
  
  try {
    spy = vi.spyOn(obj as any, methodName as any)
  } catch (error) {
    // Some properties (like window.onunhandledrejection) throw "Illegal invocation" 
    // when using vi.spyOn. For these, we need to manually replace the property.
    if (error instanceof TypeError && error.message.includes('Illegal invocation')) {
      spy = vi.fn() as MockInstance<any>
      
      // Manually replace the property with our spy
      Object.defineProperty(obj, methodName, {
        value: spy,
        writable: true,
        configurable: true,
      })
      
      // Set up call-through behavior if there was an original function
      if (typeof original === 'function') {
        spy.mockImplementation(function (this: any, ...args: any[]) {
          const context = this === spy || this === undefined ? obj : this
          return original.apply(context, args)
        } as any)
      }
    } else {
      // Re-throw if it's a different error
      throw error
    }
  }
  
  // Preserve the original's context by binding or using a wrapper function
  // Handle cases where the property might be null/undefined (e.g., window.onerror)
  if (spy && typeof original === 'function' && !spy.getMockImplementation()) {
    spy.mockImplementation(function (this: any, ...args: any[]) {
      // Ensure the correct context is used when calling the original
      const context = this === spy || this === undefined ? obj : this
      return original.apply(context, args)
    } as any)
  } else if (original === null || original === undefined) {
    // For properties like window.onerror that might be null/undefined initially,
    // don't set up call-through behavior - just let it be a spy
    // The spy will track calls but won't call through (since there's nothing to call)
  } else if (spy && original !== undefined && typeof original !== 'function' && !spy.getMockImplementation()) {
    // For non-function properties, restore original behavior
    spy.mockImplementation((() => original) as any)
  }
  
  return wrapSpyWithJasmineApi(spy as any)
}

/**
 * Creates a spy on an object's property (equivalent to Jasmine's spyOnProperty)
 * @param obj The object containing the property
 * @param propertyName The name of the property to spy on
 * @param accessType The type of access ('get' or 'set')
 * @returns A Vitest spy with Jasmine-compatible API
 */
export function spyOnProperty<T extends object, K extends keyof T>(
  obj: T,
  propertyName: K,
  accessType: 'get' | 'set'
): JasmineSpy<any> {
  const spy = accessType === 'get' 
    ? vi.spyOn(obj as any, propertyName as any, 'get') 
    : vi.spyOn(obj as any, propertyName as any, 'set')
  return wrapSpyWithJasmineApi(spy as any)
}

// ============================================================================
// Jasmine-compatible Spy API
// ============================================================================

export interface JasmineSpy<T extends (...args: any[]) => any = any> extends MockInstance<T> {
  /** Jasmine's .and.callFake() -> Vitest's .mockImplementation() */
  and: {
    callFake: (fn: T) => JasmineSpy<T>
    callThrough: () => JasmineSpy<T>
    returnValue: (value: ReturnType<T>) => JasmineSpy<T>
    returnValues: (...values: Array<ReturnType<T>>) => JasmineSpy<T>
    throwError: (error: any) => JasmineSpy<T>
    stub: () => JasmineSpy<T>
  }
  /** Jasmine's .calls API -> Vitest's .mock.calls */
  calls: {
    count: () => number
    all: () => Array<{ args: Parameters<T>; returnValue: ReturnType<T> }>
    allArgs: () => Array<Parameters<T>>
    any: () => boolean
    argsFor: (index: number) => Parameters<T>
    first: () => { args: Parameters<T>; returnValue: ReturnType<T> }
    mostRecent: () => { args: Parameters<T>; returnValue: ReturnType<T> }
    reset: () => void
  }
}

/**
 * Wraps a Vitest spy with Jasmine-compatible API methods
 */
function wrapSpyWithJasmineApi<T extends (...args: any[]) => any>(spy: MockInstance<T>): JasmineSpy<T> {
  const wrappedSpy = spy as JasmineSpy<T>

  // Add Jasmine's .and API
  wrappedSpy.and = {
    callFake: (fn: T) => {
      spy.mockImplementation(fn)
      return wrappedSpy
    },
    callThrough: () => {
      // Restore the spy to call through to the original implementation
      spy.mockRestore()
      // Re-spy to track calls but call through
      const original = (spy as any).getMockImplementation?.()
      if (original) {
        spy.mockImplementation(original as T)
      }
      return wrappedSpy
    },
    returnValue: (value: ReturnType<T>) => {
      spy.mockReturnValue(value)
      return wrappedSpy
    },
    returnValues: (...values: Array<ReturnType<T>>) => {
      values.forEach((value) => spy.mockReturnValueOnce(value))
      return wrappedSpy
    },
    throwError: (error: any) => {
      spy.mockImplementation(() => {
        throw error
      })
      return wrappedSpy
    },
    stub: () => {
      spy.mockImplementation(vi.fn() as any)
      return wrappedSpy
    },
  }

  // Add Jasmine's .calls API
  wrappedSpy.calls = {
    count: () => spy.mock.calls.length,
    all: () =>
      spy.mock.calls.map((args, i) => ({
        args: args as Parameters<T>,
        returnValue: spy.mock.results[i]?.value as ReturnType<T>,
      })),
    allArgs: () => spy.mock.calls as Array<Parameters<T>>,
    any: () => spy.mock.calls.length > 0,
    argsFor: (index: number) => spy.mock.calls[index] as Parameters<T>,
    first: () => ({
      args: spy.mock.calls[0] as Parameters<T>,
      returnValue: spy.mock.results[0]?.value as ReturnType<T>,
    }),
    mostRecent: () => {
      const lastIndex = spy.mock.calls.length - 1
      return {
        args: spy.mock.calls[lastIndex] as Parameters<T>,
        returnValue: spy.mock.results[lastIndex]?.value as ReturnType<T>,
      }
    },
    reset: () => spy.mockClear(),
  }

  return wrappedSpy
}

// ============================================================================
// Clock API
// ============================================================================

/**
 * Mock clock implementation (equivalent to jasmine.clock())
 */
class MockClock {
  private installed = false

  install() {
    if (!this.installed) {
      vi.useFakeTimers()
      this.installed = true
    }
    return this
  }

  uninstall() {
    if (this.installed) {
      vi.useRealTimers()
      this.installed = false
    }
    return this
  }

  tick(milliseconds: number) {
    vi.advanceTimersByTime(milliseconds)
    return this
  }

  mockDate(date?: Date) {
    if (date) {
      vi.setSystemTime(date)
    } else {
      vi.setSystemTime(new Date())
    }
    return this
  }
}

// ============================================================================
// Main jasmine object
// ============================================================================

/**
 * Main jasmine compatibility object
 */
export const jasmine = {
  /**
   * Creates a spy function
   * @param name Optional name for the spy
   * @example
   * const spy = jasmine.createSpy('mySpy')
   */
  createSpy: <T extends (...args: any[]) => any = any>(name?: string) => {
    const spy = createSpy<T>(name)
    return wrapSpyWithJasmineApi(spy)
  },

  /**
   * Creates a spy object with multiple methods
   * @param baseName Base name for the spy object
   * @param methodNames Array of method names to create spies for
   * @example
   * const spy = jasmine.createSpyObj('myObj', ['method1', 'method2'])
   */
  createSpyObj: <T extends Record<string, any>>(
    baseName: string,
    methodNames: Array<keyof T> | Record<keyof T, any>
  ): { [K in keyof T]: JasmineSpy } => {
    const spyObj = {} as { [K in keyof T]: JasmineSpy }
    const methods = Array.isArray(methodNames) ? methodNames : Object.keys(methodNames)

    methods.forEach((methodName) => {
      const spy = createSpy(String(methodName))
      spyObj[methodName as keyof T] = wrapSpyWithJasmineApi(spy)
      
      // If methodNames is an object, set return values
      if (!Array.isArray(methodNames) && methodNames[methodName] !== undefined) {
        spyObj[methodName as keyof T].and.returnValue(methodNames[methodName])
      }
    })

    return spyObj
  },

  /**
   * Returns the clock API for timer manipulation
   */
  clock: () => new MockClock(),

  /**
   * Checks if a function is a spy
   * @param fn Function to check
   */
  isSpy: (fn: any): boolean => vi.isMockFunction(fn),

  /**
   * Gets the current environment (for compatibility)
   */
  getEnv: () => ({
    addReporter: () => {
      // No-op for compatibility
    },
  }),

  /**
   * any - Jasmine matchers compatibility
   */
  any: (constructor: any) => ({
    asymmetricMatch: (value: any) => value instanceof constructor || typeof value === constructor.name.toLowerCase(),
    jasmineToString: () => `<jasmine.any(${constructor.name})>`,
  }),

  /**
   * anything - Jasmine matcher compatibility
   */
  anything: () => ({
    asymmetricMatch: (value: any) => value !== null && value !== undefined,
    jasmineToString: () => '<jasmine.anything>',
  }),

  /**
   * objectContaining - Jasmine matcher compatibility
   */
  objectContaining: (sample: Record<string, any>) => ({
    asymmetricMatch: (value: any) => {
      if (typeof value !== 'object' || value === null) return false
      return Object.keys(sample).every((key) => {
        if (typeof sample[key] === 'object' && sample[key] !== null) {
          return JSON.stringify(value[key]) === JSON.stringify(sample[key])
        }
        return value[key] === sample[key]
      })
    },
    jasmineToString: () => `<jasmine.objectContaining(${JSON.stringify(sample)})>`,
  }),

  /**
   * arrayContaining - Jasmine matcher compatibility
   */
  arrayContaining: (sample: any[]) => ({
    asymmetricMatch: (value: any) => {
      if (!Array.isArray(value)) return false
      return sample.every((item) => value.includes(item))
    },
    jasmineToString: () => `<jasmine.arrayContaining(${JSON.stringify(sample)})>`,
  }),

  /**
   * stringMatching - Jasmine matcher compatibility
   */
  stringMatching: (pattern: string | RegExp) => ({
    asymmetricMatch: (value: any) => {
      if (typeof value !== 'string') return false
      if (typeof pattern === 'string') return value.includes(pattern)
      return pattern.test(value)
    },
    jasmineToString: () => `<jasmine.stringMatching(${pattern})>`,
  }),
}

// ============================================================================
// Type Definitions for Jasmine compatibility
// ============================================================================

export type Func = (...args: any[]) => any

export interface Spy<Fn extends Func = Func> extends JasmineSpy<Fn> {}

export interface SpyObj<T = any> {
  [key: string]: JasmineSpy
}

// ============================================================================
// Global augmentation (optional - for drop-in replacement)
// ============================================================================

/**
 * To use this as a complete drop-in replacement, you can augment the global scope:
 * 
 * declare global {
 *   const jasmine: typeof import('./jasmineAdapter').jasmine
 *   const spyOn: typeof import('./jasmineAdapter').spyOn
 *   const spyOnProperty: typeof import('./jasmineAdapter').spyOnProperty
 * }
 */

