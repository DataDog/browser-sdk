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

/** An instrumentation, as installed by instrumentMethod(). */
type Instrumentation<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = {
  onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
  requiresHandlingStack: boolean
}

/** A hook that intercepts calls to a method and invokes any installed instrumentations. */
type MethodHook<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = {
  original: TARGET[METHOD]
  hook: TARGET[METHOD]
  anyRequireHandlingStack: boolean
  instrumentations: Array<Instrumentation<TARGET, METHOD>>
}

/**
 * A collection of all hooked methods associated with some object and their associated
 * hooks.
 */
type ObjectHooks<TARGET extends { [key: string]: any }> = {
  [METHOD in keyof TARGET]?: MethodHook<TARGET, METHOD>
}

/** A map from objects to their collection of hooks. */
const objectHookMap = new WeakMap<object, ObjectHooks<object>>()

function getOrCreateObjectHooks<TARGET extends { [key: string]: any }>(target: TARGET): ObjectHooks<TARGET> {
  const existingObjectHooks = objectHookMap.get(target) as ObjectHooks<TARGET> | undefined
  if (existingObjectHooks) {
    return existingObjectHooks
  }

  const objectHooks = {}
  objectHookMap.set(target, objectHooks)
  return objectHooks
}

function getOrInstallMethodHook<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
  objectHooks: ObjectHooks<TARGET>,
  targetPrototype: TARGET,
  method: METHOD
): MethodHook<TARGET, METHOD> | undefined {
  const existingMethodHook: MethodHook<TARGET, METHOD> | undefined = objectHooks[method]
  if (existingMethodHook) {
    return existingMethodHook
  }

  let original = targetPrototype[method]
  if (typeof original !== 'function') {
    if (method in targetPrototype && startsWith(method, 'on')) {
      original = noop as TARGET[METHOD]
    } else {
      return undefined
    }
  }

  const methodHook: MethodHook<TARGET, METHOD> = {
    original,
    hook: function (this: TARGET): ReturnType<TARGET[METHOD]> {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return invokeHookedMethod(
        original,
        this,
        arrayFrom(arguments) as Parameters<TARGET[METHOD]>,
        methodHook.anyRequireHandlingStack ? createHandlingStack() : undefined,
        methodHook.instrumentations,
        0
      )
    } as TARGET[METHOD],
    anyRequireHandlingStack: false,
    instrumentations: [],
  }

  objectHooks[method] = methodHook
  targetPrototype[method] = methodHook.hook
  return methodHook
}

function invokeHookedMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET>(
  original: TARGET[METHOD],
  thisArg: TARGET,
  args: Parameters<TARGET[METHOD]>,
  handlingStack: string | undefined,
  instrumentations: Array<Instrumentation<TARGET, METHOD>>,
  nextInstrumentation: number
): ReturnType<TARGET[METHOD]> {
  if (nextInstrumentation >= instrumentations.length) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return original.apply(thisArg, args)
  }

  const instrumentation = instrumentations[nextInstrumentation]

  let postCallCallback: PostCallCallback<TARGET, METHOD> | undefined

  callMonitored(instrumentation.onPreCall, null, [
    {
      target: thisArg,
      parameters: args,
      onPostCall: (callback) => {
        postCallCallback = callback
      },
      handlingStack,
    },
  ])

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const result = invokeHookedMethod(original, thisArg, args, handlingStack, instrumentations, nextInstrumentation + 1)

  if (postCallCallback) {
    callMonitored(postCallCallback, null, [result])
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return result
}

/**
 * Instruments a method on a object, calling the given callback before the
 * original method is invoked. The callback receives an object with information
 * about the method call.
 *
 * This function makes sure that we are "good citizens" regarding third party
 * instrumentations: when removing the instrumentation, the original method is
 * usually restored, but if a third party instrumentation was set after ours, we
 * keep it in place and just replace our instrumentation with a noop. The
 * implementation is designed to ensure that no more than one layer of wrapping
 * is ever added to each method, preventing stack overflow even in the case of
 * accidental misuse of this API or buggy behavior by third-party
 * instrumentation scripts.
 *
 * Note: it is generally better to instrument methods that are "owned" by the
 * object instead of ones that are inherited from the prototype chain. Example:
 * * do:    `instrumentMethod(Array.prototype, 'push', ...)`
 * * don't: `instrumentMethod([], 'push', ...)`
 *
 * This method is also used to set event handler properties (ex: window.onerror
 * = ...), as it has the same requirements as instrumenting a method: * if the
 * event handler is already set by a third party, we need to call it and not
 * just blindly override it. * if the event handler is set by a third party
 * after us, we need to keep it in place when removing ours.
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
  const objectHooks = getOrCreateObjectHooks(targetPrototype)
  const methodHook = getOrInstallMethodHook(objectHooks, targetPrototype, method)
  if (!methodHook) {
    // We can't hook this method (e.g., because it's not actually a function).
    return { stop: noop }
  }

  // We only generate the handling stack if at least one instrumentation
  // actually requires it.
  const requiresHandlingStack = !!computeHandlingStack
  methodHook.anyRequireHandlingStack = methodHook.anyRequireHandlingStack || requiresHandlingStack

  // Create the instrumentation requested by the caller, and add it to the
  // hook's collection of instrumentations. We use 'unshift' so that newly added
  // instrumentations are invoked before older ones, which approximates the
  // behavior of a simple function wrapper.
  const instrumentation: Instrumentation<TARGET, METHOD> = {
    onPreCall,
    requiresHandlingStack,
  }
  methodHook.instrumentations.unshift(instrumentation)

  return {
    stop: () => {
      // If this instrumentation is still attach to the hook, remove it, and recompute
      // shared hook state.
      const index = methodHook.instrumentations.indexOf(instrumentation)
      if (index > -1) {
        methodHook.instrumentations.splice(index, 1)
        methodHook.anyRequireHandlingStack = methodHook.instrumentations.some((item) => item.requiresHandlingStack)
      }

      // If we have no more instrumentations for this hook, and the underlying method has
      // not been overridden in the mean time, remove the hook.
      if (methodHook.instrumentations.length === 0 && targetPrototype[method] === methodHook.hook) {
        targetPrototype[method] = methodHook.original
        delete objectHooks[method]
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
