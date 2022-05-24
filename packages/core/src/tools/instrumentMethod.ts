import { callMonitored, monitor } from '../domain/telemetry'
import { noop } from './utils'

export function instrumentMethod<OBJECT extends { [key: string]: any }, METHOD extends keyof OBJECT>(
  object: OBJECT,
  method: METHOD,
  instrumentationFactory: (
    original: OBJECT[METHOD]
  ) => (this: OBJECT, ...args: Parameters<OBJECT[METHOD]>) => ReturnType<OBJECT[METHOD]>
) {
  const original = object[method]

  let instrumentation = instrumentationFactory(original)

  const instrumentationWrapper = function (this: OBJECT): ReturnType<OBJECT[METHOD]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return instrumentation.apply(this, arguments as unknown as Parameters<OBJECT[METHOD]>)
  }
  object[method] = instrumentationWrapper as OBJECT[METHOD]

  return {
    stop: () => {
      if (object[method] === instrumentationWrapper) {
        object[method] = original
      } else {
        instrumentation = original
      }
    },
  }
}

export function instrumentMethodAndCallOriginal<OBJECT extends { [key: string]: any }, METHOD extends keyof OBJECT>(
  object: OBJECT,
  method: METHOD,
  {
    before,
    after,
  }: {
    before?: (this: OBJECT, ...args: Parameters<OBJECT[METHOD]>) => void
    after?: (this: OBJECT, ...args: Parameters<OBJECT[METHOD]>) => void
  }
) {
  return instrumentMethod(
    object,
    method,
    (original) =>
      function () {
        const args = arguments as unknown as Parameters<OBJECT[METHOD]>
        let result

        if (before) {
          callMonitored(before, this as ThisParameterType<OBJECT[METHOD]>, args)
        }

        if (typeof original === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          result = original.apply(this, args)
        }

        if (after) {
          callMonitored(after, this as ThisParameterType<OBJECT[METHOD]>, args)
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result
      }
  )
}

export function instrumentSetter<OBJECT extends { [key: string]: any }, PROPERTY extends keyof OBJECT>(
  object: OBJECT,
  property: PROPERTY,
  after: (thisObject: OBJECT, value: OBJECT[PROPERTY]) => void
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(object, property)
  if (!originalDescriptor || !originalDescriptor.set || !originalDescriptor.configurable) {
    return { stop: noop }
  }

  let instrumentation = (thisObject: OBJECT, value: OBJECT[PROPERTY]) => {
    // put hooked setter into event loop to avoid of set latency
    setTimeout(
      monitor(() => {
        after(thisObject, value)
      }),
      0
    )
  }

  const instrumentationWrapper = function (this: OBJECT, value: OBJECT[PROPERTY]) {
    originalDescriptor.set!.call(this, value)
    instrumentation(this, value)
  }

  Object.defineProperty(object, property, {
    set: instrumentationWrapper,
  })

  return {
    stop: () => {
      if (Object.getOwnPropertyDescriptor(object, property)?.set === instrumentationWrapper) {
        Object.defineProperty(object, property, originalDescriptor)
      } else {
        instrumentation = noop
      }
    },
  }
}
