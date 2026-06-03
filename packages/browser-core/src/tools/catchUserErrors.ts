import { display } from './display'

export function catchUserErrors<Args extends any[], R>(fn: (...args: Args) => R, errorMsg: string) {
  return (...args: Args) => {
    try {
      return fn(...args)
    } catch (err) {
      display.error(errorMsg, err)
    }
  }
}
