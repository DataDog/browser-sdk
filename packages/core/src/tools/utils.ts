import { arrayFrom } from './polyfills'

export function removeDuplicates<T>(array: T[]) {
  const set = new Set<T>()
  array.forEach((item) => set.add(item))
  return arrayFrom(set)
}
