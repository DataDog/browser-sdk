export function includes(candidate: string, search: string): boolean
export function includes<T>(candidate: T[], search: T): boolean
export function includes(candidate: string | unknown[], search: any) {
  return candidate.indexOf(search) !== -1
}

export function arrayFrom<T>(arrayLike: ArrayLike<T> | Set<T>): T[] {
  if (Array.from) {
    return Array.from(arrayLike)
  }

  const array = []

  if (arrayLike instanceof Set) {
    arrayLike.forEach((item) => array.push(item))
  } else {
    for (let i = 0; i < arrayLike.length; i++) {
      array.push(arrayLike[i])
    }
  }

  return array
}

export function find<T, S extends T>(
  array: ArrayLike<T>,
  predicate: (item: T, index: number) => item is S
): S | undefined
export function find<T>(array: ArrayLike<T>, predicate: (item: T, index: number) => boolean): T | undefined
export function find(array: ArrayLike<unknown>, predicate: (item: unknown, index: number) => boolean): unknown {
  for (let i = 0; i < array.length; i += 1) {
    const item = array[i]
    if (predicate(item, i)) {
      return item
    }
  }
  return undefined
}

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

export function forEach<List extends { [index: number]: any }>(
  list: List,
  callback: (value: List[number], index: number, parent: List) => void
) {
  Array.prototype.forEach.call(list, callback as any)
}

export function objectValues<T = unknown>(object: { [key: string]: T }) {
  return Object.keys(object).map((key) => object[key])
}

export function objectEntries<T = unknown>(object: { [key: string]: T }): Array<[string, T]> {
  return Object.keys(object).map((key) => [key, object[key]])
}

export function startsWith(candidate: string, search: string) {
  return candidate.slice(0, search.length) === search
}

export function endsWith(candidate: string, search: string) {
  return candidate.slice(-search.length) === search
}

interface Assignable {
  [key: string]: any
}

export function assign<T, U>(target: T, source: U): T & U
export function assign<T, U, V>(target: T, source1: U, source2: V): T & U & V
export function assign<T, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W
export function assign<T, U, V, W, X>(target: T, source1: U, source2: V, source3: W, source4: X): T & U & V & W & X
export function assign(target: Assignable, ...toAssign: Assignable[]) {
  toAssign.forEach((source: Assignable) => {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key]
      }
    }
  })
  return target
}
