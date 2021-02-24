export function catchUserErrors<Args extends any[], R>(fn: (...args: Args) => R, errorMsg: string) {
  return (...args: Args) => {
    try {
      return fn(...args)
    } catch (err) {
      console.error(errorMsg, err)
    }
  }
}
