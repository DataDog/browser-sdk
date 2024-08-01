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

// keep wrapper function as it is better minified by babel and will result in smaller bundle size

export function objectValues<T = unknown>(object: { [key: string]: T }) {
  return Object.values(object)
}

// TODO remove after updating target to es2018
export function objectEntries<T = unknown>(object: { [key: string]: T }): Array<[string, T]> {
  return Object.entries(object)
}
