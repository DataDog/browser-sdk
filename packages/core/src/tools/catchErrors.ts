export function catchErrors<Args extends any[], R>(fn: (...args: Args) => R, errorMsg: string) {
  return (...args: Args) => {
    let result
    try {
      result = fn(...args)
    } catch (err) {
      console.error(errorMsg, err)
    }
    return result
  }
}
