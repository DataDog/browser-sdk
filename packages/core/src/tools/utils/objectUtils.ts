import { display } from '../display'

export function shallowClone<T>(object: T): T & Record<string, never> {
  return { ...object } as T & Record<string, never>
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

const NO_DIFF = 'DD_NO_DIFF'
export function simpleDiff(oldData: unknown, newData: unknown) {
  if (oldData === newData) {
    return NO_DIFF
  }

  if (Array.isArray(oldData) && Array.isArray(newData) && Array.isArray(oldData) && Array.isArray(newData)) {
    return NO_DIFF
  }

  // If oldData or newData is an object or array, we recurse into its properties/elements
  if (typeof oldData === 'object' && typeof newData === 'object') {
    const diff: { [key: string]: any } = {}

    // Recurse on the keys of the objects
    const keys = Object.keys(oldData as object).concat(Object.keys(newData as object))
    keys.forEach((key) => {
      const oldValue = (oldData as object)[key as keyof typeof oldData]
      const newValue = (newData as object)[key as keyof typeof newData]

      const propertyDiff = simpleDiff(oldValue, newValue)
      if (propertyDiff !== NO_DIFF) {
        diff[key] = propertyDiff
      }
      display.log('diff', diff)
    })

    return isEmptyObject(diff) ? undefined : diff
  }

  return newData
}

// function getObjectDiff<T extends JSONValue>(obj1: T, obj2: T): Partial<T> {
//   if (obj1 === obj2) {
//     return {} as Partial<T>
//   } // No difference

//   if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
//     return obj1 === obj2 ? ({} as Partial<T>) : obj2 // Primitive values or null
//   }

//   if (Array.isArray(obj1) && Array.isArray(obj2)) {
//     return obj1.length === obj2.length && obj1.every((v, i) => v === obj2[i]) ? ([] as Partial<T>) : obj2
//   }

//   const diff: Partial<T> = {} as Partial<T>

//   // Check keys in obj1 (for removed or changed keys)
//   Object.keys(obj1).forEach((key) => {
//     if (!(key in obj2)) {
//       ;(diff as any)[key] = undefined // Mark as removed
//     } else {
//       const subDiff = getObjectDiff(obj1[key] as JSONValue, obj2[key as keyof typeof T] as JSONValue)
//       if (Object.keys(subDiff).length > 0 || Array.isArray(subDiff)) {
//         ;(diff as any)[key] = subDiff // Store changes
//       }
//     }
//   })

//   // Check keys in obj2 (for added keys)
//   Object.keys(obj2).forEach((key) => {
//     if (!(key in obj1)) {
//       ;(diff as any)[key] = obj2[key]
//     }
//   })

//   return diff
// }

// type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

// function combineObjectDiff<T extends JSONValue>(obj1: T, diff: T): T {
//   if (diff === undefined) {
//     return obj1
//   }
//   if (typeof diff !== 'object' || diff === null) {
//     return diff
//   } // Replace primitive or null

//   if (Array.isArray(diff)) {
//     return diff as T
//   } // Replace entire array

//   const combined: any = Array.isArray(obj1) ? [...obj1] : { ...obj1 }

//   for (const key in diff) {
//     if (diff[key] === undefined) {
//       delete combined[key] // Remove key
//     } else {
//       combined[key] = combineObjectDiff(obj1?.[key] as JSONValue, diff[key])
//     }
//   }

//   return combined as T
// }

export function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false
  }

  const keysA = Object.keys(a) as Array<keyof T>
  const keysB = Object.keys(b) as Array<keyof T>

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false
    }
  }

  return true
}
