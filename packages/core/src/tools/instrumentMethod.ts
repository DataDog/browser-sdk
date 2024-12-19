import { callMonitored } from './monitor'
import { noop } from './utils/functionUtils'
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

/** Instrumentation that observes a method, as installed by instrumentMethod(). */
type MethodObserver<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = {
  onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
  requiresHandlingStack: boolean
}

/** Instrumentation that observes a property, as installed by instrumentSetter(). */
type PropertyObserver<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET> = {
  after: (target: TARGET, value: TARGET[PROPERTY]) => void
}

/** A hook that intercepts calls to a method and invokes any installed observers. */
type MethodHook<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = {
  original: TARGET[METHOD]
  hook: TARGET[METHOD]

  anyRequireHandlingStack: boolean
  observers: Array<MethodObserver<TARGET, METHOD>>

  addObserver: (
    onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void,
    computeHandlingStack: boolean
  ) => MethodObserver<TARGET, METHOD>
  removeObserver: (observer: MethodObserver<TARGET, METHOD>) => void
}

/** A hook that intercepts mutations to a property and invokes any installed observers. */
type PropertyHook<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET> = {
  original: PropertyDescriptor
  hook: PropertyDescriptor

  observers: Array<PropertyObserver<TARGET, PROPERTY>>

  addObserver: (after: (target: TARGET, value: TARGET[PROPERTY]) => void) => PropertyObserver<TARGET, PROPERTY>
  removeObserver: (observer: PropertyObserver<TARGET, PROPERTY>) => void
}

/** A collection of all hooks associated with some object. */
type ObjectHooks<TARGET extends { [key: string]: any }> = {
  methods: {
    [METHOD in keyof TARGET]?: MethodHook<TARGET, METHOD>
  }
  properties: {
    [PROPERTY in keyof TARGET]?: PropertyHook<TARGET, PROPERTY>
  }
}

/** A map from objects to their collection of hooks. */
const objectHookMap = new WeakMap<object, ObjectHooks<object>>()

function getOrCreateObjectHooks<TARGET extends { [key: string]: any }>(target: TARGET): ObjectHooks<TARGET> {
  const existingObjectHooks = objectHookMap.get(target) as ObjectHooks<TARGET> | undefined
  if (existingObjectHooks) {
    return existingObjectHooks
  }

  const objectHooks = { methods: {}, properties: {} }
  objectHookMap.set(target, objectHooks)
  return objectHooks
}

function getOrInstallMethodHook<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
  objectHooks: ObjectHooks<TARGET>,
  targetPrototype: TARGET,
  method: METHOD
): MethodHook<TARGET, METHOD> | undefined {
  const existingMethodHook: MethodHook<TARGET, METHOD> | undefined = objectHooks.methods[method]
  if (existingMethodHook) {
    return existingMethodHook
  }

  let original = targetPrototype[method]
  if (typeof original !== 'function') {
    if (method in targetPrototype && method.startsWith('on')) {
      original = noop as TARGET[METHOD]
    } else {
      return undefined
    }
  }

  const methodHook: MethodHook<TARGET, METHOD> = {
    original,
    hook: function (this: TARGET): ReturnType<TARGET[METHOD]> {
      const parameters = Array.from(arguments) as Parameters<TARGET[METHOD]>
      const handlingStack = methodHook.anyRequireHandlingStack ? createHandlingStack() : undefined

      const postCallCallbacks: Array<PostCallCallback<TARGET, METHOD>> = []
      for (const observer of methodHook.observers) {
        callMonitored(observer.onPreCall, null, [
          {
            target: this,
            parameters,
            onPostCall(callback: PostCallCallback<TARGET, METHOD>) {
              postCallCallbacks.unshift(callback)
            },
            handlingStack,
          },
        ])
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const result = original.apply(this, parameters)

      for (const postCallCallback of postCallCallbacks) {
        callMonitored(postCallCallback, null, [result])
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result
    } as TARGET[METHOD],

    anyRequireHandlingStack: false,
    observers: [],

    addObserver(
      onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void,
      computeHandlingStack: boolean
    ): MethodObserver<TARGET, METHOD> {
      // We only generate the handling stack if at least one observer actually
      // requires it.
      const requiresHandlingStack = !!computeHandlingStack
      methodHook.anyRequireHandlingStack = methodHook.anyRequireHandlingStack || requiresHandlingStack

      // Create the observer requested by the caller, and add it to the hook's
      // collection of observers. We use 'unshift' so that newly added observers are
      // invoked before older ones, which approximates the behavior of a simple
      // function wrapper.
      const observer: MethodObserver<TARGET, METHOD> = {
        onPreCall,
        requiresHandlingStack,
      }
      methodHook.observers.unshift(observer)

      return observer
    },
    removeObserver(observer: MethodObserver<TARGET, METHOD>): void {
      // If this observer is still attached to this hook, remove it, and
      // recompute shared hook state.
      const index = methodHook.observers.indexOf(observer)
      if (index > -1) {
        methodHook.observers.splice(index, 1)
        methodHook.anyRequireHandlingStack = methodHook.observers.some((item) => item.requiresHandlingStack)
      }

      // If we still have observers attached to this hook, leave it in place.
      if (methodHook.observers.length > 0) {
        return
      }

      // We've removed the last observer. If the underlying method has
      // not been overridden in the meantime, remove the hook.
      if (targetPrototype[method] === methodHook.hook) {
        targetPrototype[method] = methodHook.original
        delete objectHooks.methods[method]
      }
    },
  }

  objectHooks.methods[method] = methodHook
  targetPrototype[method] = methodHook.hook
  return methodHook
}

function getOrInstallPropertyHook<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET>(
  objectHooks: ObjectHooks<TARGET>,
  targetPrototype: TARGET,
  property: PROPERTY
): PropertyHook<TARGET, PROPERTY> | undefined {
  const existingPropertyHook: PropertyHook<TARGET, PROPERTY> | undefined = objectHooks.properties[property]
  if (existingPropertyHook) {
    return existingPropertyHook
  }

  const original = Object.getOwnPropertyDescriptor(targetPrototype, property)
  if (!original || !original.set || !original.configurable) {
    return undefined
  }

  const propertyHook: PropertyHook<TARGET, PROPERTY> = {
    original,
    hook: {
      set(this: TARGET, value: TARGET[PROPERTY]): void {
        original.set!.call(this, value)

        if (propertyHook.observers.length === 0) {
          return
        }

        // Invoke observers in separate microtasks to avoid setter latency.
        //
        // Note that we deliberately don't capture the active observers here; as a
        // design decision, we've chosen to allow changes in the observer list to
        // take effect immediately, even if they occur between the time a setter is called
        // and the time at which its observers are invoked.
        // Context: https://github.com/DataDog/browser-sdk/pull/2598
        void Promise.resolve().then(() => {
          for (const { after } of propertyHook.observers) {
            after(this, value)
          }
        })
      },
    },

    observers: [],

    addObserver(after: (target: TARGET, value: TARGET[PROPERTY]) => void): PropertyObserver<TARGET, PROPERTY> {
      // Create the observer requested by the caller, and add it to the
      // hook's collection of observers. We use 'unshift' so that newly added
      // observers are invoked before older ones, which approximates the
      // behavior of a simple function wrapper.
      const observer: PropertyObserver<TARGET, PROPERTY> = { after }
      propertyHook.observers.unshift(observer)
      return observer
    },
    removeObserver(observer: PropertyObserver<TARGET, PROPERTY>): void {
      // If this observer is still attached to this hook, remove it.
      const index = propertyHook.observers.indexOf(observer)
      if (index > -1) {
        propertyHook.observers.splice(index, 1)
      }

      // If we still have observers attached to this hook, leave it in place.
      if (propertyHook.observers.length > 0) {
        return
      }

      // We've removed the last observer. If the underlying property has
      // not been overridden in the meantime, remove the hook.
      const current = Object.getOwnPropertyDescriptor(targetPrototype, property)
      if (current?.set === propertyHook.hook.set) {
        Object.defineProperty(targetPrototype, property, propertyHook.original)
        delete objectHooks.properties[property]
      }
    },
  }

  objectHooks.properties[property] = propertyHook
  Object.defineProperty(targetPrototype, property, propertyHook.hook)
  return propertyHook
}

/**
 * @returns a snapshot of the active observers for target[method]. Exposed only
 * for testing.
 */
export function getObserversForMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
  target: TARGET,
  method: METHOD
): Array<MethodObserver<TARGET, METHOD>> {
  const objectHooks = objectHookMap.get(target) as ObjectHooks<TARGET>
  return (objectHooks?.methods?.[method]?.observers ?? []).concat()
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
 *    console.error('Before calling fetch on', target, 'with parameters', parameters)
 *
 *    onPostCall((result) => {
 *      console.error('After fetch calling on', target, 'with parameters', parameters, 'and result', result)
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
    // We can't hook this method (e.g. because it's not actually a function).
    return { stop: noop }
  }

  const observer = methodHook.addObserver(onPreCall, !!computeHandlingStack)
  return {
    stop() {
      methodHook.removeObserver(observer)
    },
  }
}

export function instrumentSetter<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET>(
  targetPrototype: TARGET,
  property: PROPERTY,
  after: (target: TARGET, value: TARGET[PROPERTY]) => void
) {
  const objectHooks = getOrCreateObjectHooks(targetPrototype)
  const propertyHook = getOrInstallPropertyHook(objectHooks, targetPrototype, property)
  if (!propertyHook) {
    // We can't hook this property (e.g. because it's not configurable).
    return { stop: noop }
  }

  const observer = propertyHook.addObserver(after)
  return {
    stop() {
      propertyHook.removeObserver(observer)
    },
  }
}
