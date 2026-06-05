import { setTimeout } from './timer'
import { callMonitored } from './monitor'
import { noop } from './utils/functionUtils'
import { createHandlingStack } from './stackTrace/handlingStack'

/**
 * Object passed to the callback of an instrumented method call. See `instrumentMethod` for more
 * info.
 */
export interface InstrumentedMethodCall<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> {
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

type ConstructorParametersOf<CONSTRUCTOR> = CONSTRUCTOR extends new (...args: infer P) => any ? P : never
type ConstructorInstanceOf<CONSTRUCTOR> = CONSTRUCTOR extends new (...args: any[]) => infer R ? R : never

type AnyConstructor = abstract new (...args: any[]) => any

/**
 * Object passed to the callback of an instrumented constructor call. See `instrumentConstructor`
 * for more info.
 */
export interface InstrumentedConstructorCall<CONSTRUCTOR> {
  /**
   * The parameters with which the constructor was called.
   *
   * Note: if needed, parameters can be mutated by the instrumentation
   */
  parameters: ConstructorParametersOf<CONSTRUCTOR>

  /**
   * Registers a callback that will be called after the original constructor is called, with the
   * constructed instance passed as argument.
   */
  onPostCall: (callback: (result: ConstructorInstanceOf<CONSTRUCTOR>) => void) => void

  /**
   * The stack trace of the constructor call.
   */
  handlingStack?: string
}

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
 * To instrument a constructor @see {@link instrumentConstructor}.
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
  onPreCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void,
  { computeHandlingStack }: { computeHandlingStack?: boolean } = {}
) {
  let original = targetPrototype[method]

  if (typeof original !== 'function') {
    if (method in targetPrototype && typeof method === 'string' && method.startsWith('on')) {
      original = noop as TARGET[METHOD]
    } else {
      return { stop: noop }
    }
  }

  return replaceWithInstrumentation(
    targetPrototype,
    method,
    original,
    (isStopped) =>
      function (this: TARGET): ReturnType<TARGET[METHOD]> {
        if (isStopped()) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
          return original.apply(this, arguments)
        }

        const parameters = Array.from(arguments) as Parameters<TARGET[METHOD]>

        return notifyInstrumentation<InstrumentedMethodCall<TARGET, METHOD>, ReturnType<TARGET[METHOD]>>(
          onPreCall,
          {
            target: this,
            parameters,
            handlingStack: computeHandlingStack ? createHandlingStack('instrumented method') : undefined,
          },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- TARGET[METHOD] is any under the index signature; value is verified as a function above
          () => original.apply(this, parameters)
        )
      } as TARGET[METHOD]
  )
}

/**
 * Instruments a constructor on an object (typically a global, e.g. `window.WebSocket`), calling the
 * given callback before the original constructor is invoked. The callback receives an object with
 * information about the constructor call, and can register an `onPostCall` callback to be notified
 * with the constructed instance.
 *
 * Like `instrumentMethod`, this is a "good citizen" regarding third party instrumentations: stopping
 * restores the original constructor unless a third party replaced it afterwards.
 *
 * The wrapper preserves the original prototype (so `instanceof` keeps working), the original
 * `new.target` (so constructors that inspect it behave as if not instrumented), the original
 * static members (e.g. `WebSocket.OPEN`), and `instance.constructor ===` so checks like
 * `new WebSocket(url).constructor === WebSocket` stay true.
 *
 * @see {@link preserveConstructorShape} for limitations on static members preservation.
 * @example
 *
 *  instrumentConstructor(window, 'WebSocket', ({ parameters, onPostCall }) => {
 *    console.log('Before constructing WebSocket with parameters', parameters)
 *
 *    onPostCall((instance) => {
 *      console.log('Constructed WebSocket instance', instance)
 *    })
 *  })
 */
export function instrumentConstructor<TARGET extends { [key: string]: any }, NAME extends keyof TARGET>(
  target: TARGET,
  name: NAME,
  onPreCall: (this: null, callInfos: InstrumentedConstructorCall<TARGET[NAME]>) => void,
  { computeHandlingStack }: { computeHandlingStack?: boolean } = {}
) {
  const original = target[name]

  if (typeof original !== 'function') {
    return { stop: noop }
  }

  let restorePrototypeConstructor: () => void = noop

  const { stop: replaceStop } = replaceWithInstrumentation(target, name, original, (isStopped) => {
    const instrumentation = function (this: TARGET): ConstructorInstanceOf<TARGET[NAME]> {
      // Bare `[[Call]]` (no `new`): delegate through `[[Call]]` and skip `onPreCall`. Otherwise we
      // would notify instrumentation before the original rejects or returns, unlike the native
      // constructor (e.g. `WebSocket(url)` or `class {}()` without `new`).
      if (!new.target) {
        return Reflect.apply(original, this, Array.from(arguments)) as ConstructorInstanceOf<TARGET[NAME]>
      }

      // When `new` is used on this instrumented property, `new.target` is this wrapper. Passing
      // it through to Reflect.construct would expose the wrong new.target inside the original
      // body. If a subclass extends the wrapper, or a third party wraps us and their class is
      // instantiated, `new.target` is that outer constructor and must be preserved.
      const constructNewTarget = new.target === instrumentation ? original : new.target

      if (isStopped()) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Reflect.construct(
          original,
          arguments as unknown as ConstructorParametersOf<TARGET[NAME]>,
          constructNewTarget
        )
      }

      const parameters = Array.from(arguments) as ConstructorParametersOf<TARGET[NAME]>

      return notifyInstrumentation<InstrumentedConstructorCall<TARGET[NAME]>, ConstructorInstanceOf<TARGET[NAME]>>(
        onPreCall,
        {
          parameters,
          handlingStack: computeHandlingStack ? createHandlingStack('instrumented constructor') : undefined,
        },
        () =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          Reflect.construct(original, parameters, constructNewTarget)
      )
    }

    restorePrototypeConstructor = preserveConstructorShape(instrumentation as unknown as AnyConstructor, original)

    return instrumentation as TARGET[NAME]
  })

  return {
    stop: () => {
      restorePrototypeConstructor()
      replaceStop()
    },
  }
}

/**
 * Replaces `targetPrototype[method]` with the instrumentation built by `buildInstrumentation`, and
 * returns a `stop` function restoring the original (unless a third party replaced us afterwards).
 *
 * `buildInstrumentation` receives an `isStopped` accessor so the wrapper can transparently delegate
 * to the original once the instrumentation has been stopped but consumers still hold a reference to
 * it.
 */
function replaceWithInstrumentation<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET>(
  targetPrototype: TARGET,
  method: METHOD,
  original: TARGET[METHOD],
  buildInstrumentation: (isStopped: () => boolean) => TARGET[METHOD]
) {
  let stopped = false

  const instrumentation = buildInstrumentation(() => stopped)

  targetPrototype[method] = instrumentation

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

/**
 * Runs the pre-call callback (injecting the `onPostCall` registration), invokes the original
 * method/constructor, then runs the registered post-call callback with the result.
 *
 * Note: the handling stack must be computed by the caller (at the topmost position of the call
 * stack), so it is part of `baseCallInfo` rather than computed here.
 */
function notifyInstrumentation<CALL_INFO extends InstrumentationCallbacks<RESULT>, RESULT>(
  onPreCall: (this: null, callInfo: CALL_INFO) => void,
  baseCallInfo: Omit<CALL_INFO, 'onPostCall'>,
  invokeOriginal: () => RESULT
): RESULT {
  let postCallCallback: ((result: RESULT) => void) | undefined

  callMonitored(onPreCall, null, [
    {
      ...baseCallInfo,
      onPostCall: (callback: (result: RESULT) => void) => {
        postCallCallback = callback
      },
    } as CALL_INFO,
  ])

  const result = invokeOriginal()

  if (postCallCallback) {
    callMonitored(postCallCallback, null, [result])
  }

  return result
}

interface InstrumentationCallbacks<RESULT> {
  onPostCall: (callback: (result: RESULT) => void) => void
  handlingStack?: string
}

/**
 * Copies the original constructor prototype and static members onto the instrumentation, so that
 * `instanceof` checks keep working and statics such as `WebSocket.OPEN` remain available while
 * instrumented.
 *
 * Returns a function that restores `prototype.constructor` to its prior descriptor; call it
 * before restoring the global property in `stop()`.
 */
function preserveConstructorShape(instrumentation: AnyConstructor, original: AnyConstructor): () => void {
  if (!original.prototype) {
    return noop
  }

  copyOriginalPrototype(instrumentation, original)

  const prototypeObject = original.prototype as object
  const { rewired, savedConstructorDescriptor } = tryRewirePrototypeConstructor(prototypeObject, instrumentation)

  copyOwnStaticsExceptBuiltins(original, instrumentation)

  return () =>
    restorePrototypeConstructor({
      rewired,
      prototypeObject,
      savedConstructorDescriptor,
      original,
    })
}

// Preserve the original prototype so that instanceof checks against the instrumented global work.
// e.g. `new MyClass() instanceof MyClass` must remain true.
function copyOriginalPrototype(instrumentation: AnyConstructor, original: AnyConstructor): void {
  const originalPrototypeDescriptor = Object.getOwnPropertyDescriptor(original, 'prototype')
  try {
    if (originalPrototypeDescriptor) {
      Object.defineProperty(instrumentation, 'prototype', {
        value: original.prototype,
        writable: originalPrototypeDescriptor.writable,
        enumerable: originalPrototypeDescriptor.enumerable,
        configurable: originalPrototypeDescriptor.configurable,
      })
    } else {
      instrumentation.prototype = original.prototype
    }
  } catch {
    instrumentation.prototype = original.prototype
  }
}

/*
 * Limitation: repointing `constructor` on this shared prototype affects every instance whose
 * `[[Prototype]]` is this object, including instances created before instrumentation, because
 * `constructor` is inherited rather than snapshotted per instance. Code that held `original` (or
 * whatever was in `prototype.constructor` before) as the canonical constructor and expects reference
 * equality to that value for the lifetime of the page can observe a behavior change while RUM is
 * active; restoring on `stop()` fixes this. In practice the SDK initializes as early as possible,
 * which narrows the window where pre-instrument instances exist.
 */
function tryRewirePrototypeConstructor(
  prototypeObject: object,
  instrumentation: AnyConstructor
): { rewired: boolean; savedConstructorDescriptor: PropertyDescriptor | undefined } {
  const savedConstructorDescriptor = Object.getOwnPropertyDescriptor(prototypeObject, 'constructor')

  let rewired = false
  try {
    Object.defineProperty(prototypeObject, 'constructor', {
      value: instrumentation,
      writable: savedConstructorDescriptor?.writable ?? true,
      enumerable: savedConstructorDescriptor?.enumerable ?? false,
      configurable: true,
    })
    rewired = true
  } catch {
    // Some exotic builtins keep a non-configurable `constructor` on their prototype.
  }
  return { rewired, savedConstructorDescriptor }
}

const STATIC_COPY_EXCLUDED_KEYS = new Set(['prototype', 'length', 'name', 'arguments', 'caller'])

/*
 * Limitation: only the original's *own* static members are copied. Statics inherited through the
 * constructor's prototype chain (e.g. `class Child extends Parent` where `Parent` defines statics)
 * are not preserved, since the instrumentation still inherits from `Function.prototype`. This is
 * acceptable for the globals we instrument (e.g. `WebSocket`, whose own statics are the only ones
 * that matter), but would need to delegate the static prototype chain to support subclassed
 * constructors with meaningful inherited statics.
 */
function copyOwnStaticsExceptBuiltins(original: AnyConstructor, instrumentation: AnyConstructor): void {
  for (const key of ([] as PropertyKey[]).concat(
    Object.getOwnPropertyNames(original),
    Object.getOwnPropertySymbols(original)
  )) {
    if (typeof key === 'string' && STATIC_COPY_EXCLUDED_KEYS.has(key)) {
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(original, key)
    if (descriptor) {
      Object.defineProperty(instrumentation, key, descriptor)
    }
  }
}

function restorePrototypeConstructor({
  rewired,
  prototypeObject,
  savedConstructorDescriptor,
  original,
}: {
  rewired: boolean
  prototypeObject: object
  savedConstructorDescriptor: PropertyDescriptor | undefined
  original: AnyConstructor
}): void {
  if (!rewired) {
    return
  }
  try {
    if (savedConstructorDescriptor) {
      Object.defineProperty(prototypeObject, 'constructor', savedConstructorDescriptor)
    } else {
      Object.defineProperty(prototypeObject, 'constructor', {
        value: original,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    }
  } catch {
    // Best-effort: prototype.constructor may be non-configurable
  }
}

export function instrumentSetter<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET>(
  targetPrototype: TARGET,
  property: PROPERTY,
  after: (target: TARGET, value: TARGET[PROPERTY]) => void
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(targetPrototype, property)
  if (!originalDescriptor?.set || !originalDescriptor.configurable) {
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
