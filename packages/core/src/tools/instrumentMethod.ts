export function instrumentMethod<S extends { [key: string]: any }, N extends keyof S>(
  source: S,
  name: N,
  replacementFactory: (original: S[N]) => (this: S, ...args: Parameters<S[N]>) => ReturnType<S[N]>
) {
  const original = source[name]

  let replacement = replacementFactory(original)

  const replacementWrapper = function (this: S): ReturnType<S[N]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return replacement.apply(this, (arguments as unknown) as Parameters<S[N]>)
  }
  source[name] = replacementWrapper as S[N]

  return {
    stop: () => {
      if (source[name] === replacementWrapper) {
        source[name] = original
      } else {
        replacement = original
      }
    },
  }
}
