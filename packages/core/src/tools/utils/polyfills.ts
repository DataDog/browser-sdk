export function findLast<T, S extends T>(
  array: T[],
  predicate: (item: T, index: number, array: T[]) => item is S
): S | undefined {
  for (let i = array.length - 1; i >= 0; i -= 1) {
    const item = array[i]
    if (predicate(item, i, array)) {
      return item
    }
  }
  return undefined
}

// Keep the following wrapper functions as it can be mangled and will result in smaller bundle size that using
// the native Object.values and Object.entries directly

export function objectValues<T = unknown>(object: { [key: string]: T }) {
  return Object.values(object)
}

export function objectEntries<T = unknown>(object: { [key: string]: T }): Array<[string, T]> {
  return Object.entries(object)
}
