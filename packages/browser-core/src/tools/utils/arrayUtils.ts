export function removeDuplicates<T>(array: T[]) {
  const set = new Set<T>()
  array.forEach((item) => set.add(item))
  return Array.from(set)
}

export function removeItem<T>(array: T[], item: T) {
  const index = array.indexOf(item)
  if (index >= 0) {
    array.splice(index, 1)
  }
}
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0
}
