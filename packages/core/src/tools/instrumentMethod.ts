import { setTimeout } from './timer'
import { callMonitored } from './monitor'
import { noop } from './utils/functionUtils'

/**
 * Object passed to the callback of an instrumented method call. See `instrumentMethod` for more
 * info.
 */
export type InstrumentedMethodCall<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = {
  /**
   * The target object on which the method was called.
   */
  target: TARGET

  /**
   * The parameters with which the method was called. To avoid having to clone the argument list
   * every time, this property is actually an instance of Argument, not Array, so not all methods
   * are available (like .forEach).
   *
   * Note: if needed, parameters can be mutated by the instrumentation
   */
  parameters: Parameters<TARGET[METHOD]>

  /**
   * Registers a callback that will be called after the original method is called, with the method
   * result passed as argument.
   */
  onPostCall: (callback: PostCallCallback<TARGET, METHOD>) => void
}

type PostCallCallback<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = (
  result: ReturnType<TARGET[METHOD]>
) => void

/**
 * Instruments a method on a object, calling the given callback before the original method is
 * invoked. The callback receives an object with information about the method call.
 *
 * Note: it is generally better to instrument methods that are "owned" by the object instead of ones
 * that are inherited from the prototype chain. Example:
 * * do:    `instrumentMethod(Array.prototype, 'push', ...)`
 * * don't: `instrumentMethod([], 'push', ...)`
 *
 * @example
 *
 *  instrumentMethod(window, 'fetch', ({ target, parameters, onPostCall }) => {
 *    console.log('Before calling fetch on', target, 'with parameters', parameters)
 *
 *    onPostCall((result) => {
 *      console.log('After fetch calling on', target, 'with parameters', parameters, 'and result', result)
 *    })
 *  })
 */
export function instrumentMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET>(
  targetPrototype: TARGET,
  method: METHOD,
  onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
) {
  const original = targetPrototype[method]

  let instrumentation = createInstrumentedMethod(original, onPreCall)

  const instrumentationWrapper = function (this: TARGET): ReturnType<TARGET[METHOD]> | undefined {
    if (typeof instrumentation !== 'function') {
      return undefined
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return instrumentation.apply(this, arguments as unknown as Parameters<TARGET[METHOD]>)
  }
  targetPrototype[method] = instrumentationWrapper as TARGET[METHOD]

  return {
    stop: () => {
      if (targetPrototype[method] === instrumentationWrapper) {
        targetPrototype[method] = original
      } else {
        instrumentation = original
      }
    },
  }
}

function createInstrumentedMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET>(
  original: TARGET[METHOD],
  onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
): TARGET[METHOD] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return function (this: TARGET) {
    const parameters = arguments as unknown as Parameters<TARGET[METHOD]>
    let result

    let postCallCallback: PostCallCallback<TARGET, METHOD> | undefined

    callMonitored(onPreCall, null, [
      {
        target: this,
        parameters,
        onPostCall: (callback) => {
          postCallCallback = callback
        },
      },
    ])

    if (typeof original === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      result = original.apply(this, parameters)
    }

    if (postCallCallback) {
      callMonitored(postCallCallback, null, [result])
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result
  } as TARGET[METHOD]
}

export function instrumentSetter<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET>(
  targetPrototype: TARGET,
  property: PROPERTY,
  after: (target: TARGET, value: TARGET[PROPERTY]) => void
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(targetPrototype, property)
  if (!originalDescriptor || !originalDescriptor.set || !originalDescriptor.configurable) {
    return { stop: noop }
  }

  const stoppedInstrumentation = noop
  let instrumentation = (target: TARGET, value: TARGET[PROPERTY]) => {
    // put hooked setter into event loop to avoid of set latency
    setTimeout(() => {
      if (instrumentation !== stoppedInstrumentation) {
        after(target, value)
      }
    }, 0)
  }

  const instrumentationWrapper = function (this: TARGET, value: TARGET[PROPERTY]) {
    originalDescriptor.set!.call(this, value)
    instrumentation(this, value)
  }

  Object.defineProperty(targetPrototype, property, {
    set: instrumentationWrapper,
  })

  return {
    stop: () => {
      if (Object.getOwnPropertyDescriptor(targetPrototype, property)?.set === instrumentationWrapper) {
        Object.defineProperty(targetPrototype, property, originalDescriptor)
      }
      instrumentation = stoppedInstrumentation
    },
  }
}
