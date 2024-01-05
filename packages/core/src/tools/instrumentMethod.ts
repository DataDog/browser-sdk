import { setTimeout } from './timer'
import { callMonitored } from './monitor'
import { noop } from './utils/functionUtils'

export type InstrumentedMethodCall<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = {
  target: TARGET
  // parameters can be mutated by the instrumentation
  parameters: Parameters<TARGET[METHOD]>
  onPostCall: (callback: PostCallCallback<TARGET, METHOD>) => void
}

export type PostCallCallback<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> = (
  result: ReturnType<TARGET[METHOD]>
) => void

export function instrumentMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET>(
  targetPrototype: TARGET,
  method: METHOD,
  onCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
) {
  const original = targetPrototype[method]

  let instrumentation = createInstrumentedMethod(original, onCall)

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
  onCall: (this: null, callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
): TARGET[METHOD] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return function (this: TARGET) {
    const parameters = arguments as unknown as Parameters<TARGET[METHOD]>
    let result

    let postCallCallback: PostCallCallback<TARGET, METHOD> | undefined

    callMonitored(onCall, null, [
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

  let instrumentation = (target: TARGET, value: TARGET[PROPERTY]) => {
    // put hooked setter into event loop to avoid of set latency
    setTimeout(() => {
      after(target, value)
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
      } else {
        instrumentation = noop
      }
    },
  }
}
