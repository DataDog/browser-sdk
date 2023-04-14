import { assign } from './polyfills'

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
