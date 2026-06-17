import { getType } from './typeUtils'

type Merged<TDestination, TSource> =
  // case 1 - source is undefined - return destination
  TSource extends undefined
    ? TDestination
    : // case 2 - destination is undefined - return source
      TDestination extends undefined
      ? TSource
      : // case 3 - source is an array - see if it merges or overwrites
        TSource extends any[]
        ? TDestination extends any[]
          ? TDestination & TSource
          : TSource
        : // case 4 - source is an object - see if it merges or overwrites
          TSource extends object
          ? TDestination extends object
            ? TDestination extends any[]
              ? TSource
              : TDestination & TSource
            : TSource
          : // case 5 - cannot merge - return source
            TSource

/**
 * Recursively merges `source` into `destination` in place and returns the result.
 * - Objects are merged key by key.
 * - Arrays are merged index by index.
 * - Primitive and class-instance values replace the destination.
 * - `undefined` source values leave the destination unchanged.
 * - Circular references in `source` are silently dropped.
 *
 * Prefer `combine` for a non-mutating deep merge or `deepClone` for a simple deep copy.
 * @returns The merged value — either `destination` (mutated) or `source` when they cannot be merged.
 */
export function mergeInto<D, S>(destination: D, source: S): Merged<D, S> {
  return mergeIntoInternal(destination, source, createCircularReferenceChecker())
}

function mergeIntoInternal<D, S>(
  destination: D,
  source: S,
  circularReferenceChecker: CircularReferenceChecker
): Merged<D, S> {
  // ignore the source if it is undefined
  if (source === undefined) {
    return destination as Merged<D, S>
  }

  if (typeof source !== 'object' || source === null) {
    // primitive values - just return source
    return source as Merged<D, S>
  } else if (source instanceof Date) {
    return new Date(source.getTime()) as unknown as Merged<D, S>
  } else if (source instanceof RegExp) {
    return new RegExp(source.source, source.flags) as unknown as Merged<D, S>
  }

  if (circularReferenceChecker.hasAlreadyBeenSeen(source)) {
    // remove circular references
    return undefined as unknown as Merged<D, S>
  } else if (Array.isArray(source)) {
    const merged: any[] = Array.isArray(destination) ? destination : []
    for (let i = 0; i < source.length; ++i) {
      merged[i] = mergeIntoInternal(merged[i], source[i], circularReferenceChecker)
    }
    return merged as unknown as Merged<D, S>
  }

  const merged = getType(destination) === 'object' ? (destination as Record<any, any>) : {}
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      merged[key] = mergeIntoInternal(merged[key], source[key], circularReferenceChecker)
    }
  }
  return merged as unknown as Merged<D, S>
}

/**
 * A simplistic implementation of a deep clone algorithm.
 * Caveats:
 * - It doesn't maintain prototype chains - don't use with instances of custom classes.
 * - It doesn't handle Map and Set
 * @returns A deep copy of `value` with the same type.
 */
export function deepClone<T>(value: T): T {
  return mergeInto(undefined, value) as T
}

type Combined<A, B> = A extends null ? B : B extends null ? A : Merged<A, B>

/**
 * Performs a non-mutating deep merge of two or more values.
 * - All arguments are left unchanged; the result is always a new value.
 * - Objects are merged key by key; arrays are merged index by index.
 * - `undefined` values are skipped (they do not overwrite existing values).
 * - `null` values replace existing values.
 *
 * @returns A new deeply-merged value of the combined type.
 * @example
 * combine({ a: 1 }, { b: 2 }) // { a: 1, b: 2 }
 * combine({ a: { x: 1 } }, { a: { y: 2 } }) // { a: { x: 1, y: 2 } }
 */
export function combine<A, B>(a: A, b: B): Combined<A, B>
export function combine<A, B, C>(a: A, b: B, c: C): Combined<Combined<A, B>, C>
export function combine<A, B, C, D>(a: A, b: B, c: C, d: D): Combined<Combined<Combined<A, B>, C>, D>
export function combine<A, B, C, D, E>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E
): Combined<Combined<Combined<Combined<A, B>, C>, D>, E>
export function combine<A, B, C, D, E, F>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F
): Combined<Combined<Combined<Combined<Combined<A, B>, C>, D>, E>, F>
export function combine<A, B, C, D, E, F, G>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G
): Combined<Combined<Combined<Combined<Combined<Combined<A, B>, C>, D>, E>, F>, G>
export function combine<A, B, C, D, E, F, G, H>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G,
  h: H
): Combined<Combined<Combined<Combined<Combined<Combined<Combined<A, B>, C>, D>, E>, F>, G>, H>
export function combine(...sources: any[]): unknown {
  let destination: any

  for (const source of sources) {
    // Ignore any undefined or null sources.
    if (source === undefined || source === null) {
      continue
    }

    destination = mergeInto(destination, source)
  }

  return destination as unknown
}

interface CircularReferenceChecker {
  hasAlreadyBeenSeen(value: any): boolean
}

function createCircularReferenceChecker(): CircularReferenceChecker {
  const set = new WeakSet<any>()
  return {
    hasAlreadyBeenSeen(value) {
      const has = set.has(value)
      if (!has) {
        set.add(value)
      }
      return has
    },
  }
}
