interface Assignable {
  [key: string]: any
}

export function assign<T, U>(target: T, source: U): T & U
export function assign<T, U, V>(target: T, source1: U, source2: V): T & U & V
export function assign<T, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W
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

export function shallowClone<T>(object: T): T & Record<string, never> {
  return assign({}, object)
}

export function objectHasValue<T extends { [key: string]: unknown }>(object: T, value: unknown): value is T[keyof T] {
  return Object.keys(object).some((key) => object[key] === value)
}

export function isEmptyObject(object: object) {
  return Object.keys(object).length === 0
}

export function mapValues<A, B>(object: { [key: string]: A }, fn: (arg: A) => B) {
  const newObject: { [key: string]: B } = {}
  for (const key of Object.keys(object)) {
    newObject[key] = fn(object[key])
  }
  return newObject
}
