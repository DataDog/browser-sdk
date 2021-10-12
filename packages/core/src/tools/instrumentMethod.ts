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
    return instrumentation.apply(this, (arguments as unknown) as Parameters<OBJECT[METHOD]>)
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
