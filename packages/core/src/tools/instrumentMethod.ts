import { setTimeout } from './timer'
import { callMonitored } from './monitor'
import { noop } from './utils/functionUtils'
import { arrayFrom, startsWith } from './utils/polyfills'
import { createHandlingStack } from './stackTrace/handlingStack'

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
   * The parameters with which the method was called.
   *
   * Note: if needed, parameters can be mutated by the instrumentation
   */
  parameters: Parameters<TARGET[METHOD]>

  /**
   * Registers a callback that will be called after the original method is called, with the method
   * result passed as argument.
   */
  onPostCall: (callback: PostCallCallback<TARGET, METHOD>) => void

  /**
   * The stack trace of the method call.
   */
  handlingStack?: string
}

type PostCallCallback<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = (
  result: ReturnType<TARGET[METHOD]>
) => void

/**
 * Instruments a method on a object, calling the given callback before the original method is
 * invoked. The callback receives an object with information about the method call.
 *
 * This function makes sure that we are "good citizens" regarding third party instrumentations: when
 * removing the instrumentation, the original method is usually restored, but if a third party
 * instrumentation was set after ours, we keep it in place and just replace our instrumentation with
 * a noop.
 *
 * Note: it is generally better to instrument methods that are "owned" by the object instead of ones
 * that are inherited from the prototype chain. Example:
 * * do:    `instrumentMethod(Array.prototype, 'push', ...)`
 * * don't: `instrumentMethod([], 'push', ...)`
 *
 * This method is also used to set event handler properties (ex: window.onerror = ...), as it has
 * the same requirements as instrumenting a method:
 * * if the event handler is already set by a third party, we need to call it and not just blindly
 * override it.
 * * if the event handler is set by a third party after us, we need to keep it in place when
 * removing ours.
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
export function instrumentMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
  targetPrototype: TARGET,
  method: METHOD,
  onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void,
  { computeHandlingStack }: { computeHandlingStack?: boolean } = {}
) {
  let original = targetPrototype[method]

  if (typeof original !== 'function') {
    if (startsWith(method, 'on')) {
      original = noop as TARGET[METHOD]
    } else {
      return { stop: noop }
    }
  }

  let stopped = false

  const instrumentation = function (this: TARGET): ReturnType<TARGET[METHOD]> | undefined {
    if (stopped) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      return original.apply(this, arguments as unknown as Parameters<TARGET[METHOD]>)
    }

    const parameters = arrayFrom(arguments) as Parameters<TARGET[METHOD]>

    let postCallCallback: PostCallCallback<TARGET, METHOD> | undefined

    callMonitored(onPreCall, null, [
      {
        target: this,
        parameters,
        onPostCall: (callback) => {
          postCallCallback = callback
        },
        handlingStack: computeHandlingStack ? createHandlingStack() : undefined,
      },
    ])

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = original.apply(this, parameters)

    if (postCallCallback) {
      callMonitored(postCallCallback, null, [result])
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result
  }

  targetPrototype[method] = instrumentation as TARGET[METHOD]

  return {
    stop: () => {
      stopped = true
      // If the instrumentation has been removed by a third party, keep the last one
      if (targetPrototype[method] === instrumentation) {
        targetPrototype[method] = original
      }
    },
  }
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
