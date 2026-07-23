import { noop } from '../utils/functionUtils'

export interface ObjectWithToJsonMethod {
  toJSON?: () => unknown
}

export function detachToJsonMethod(value: object) {
  const object = value as ObjectWithToJsonMethod
  const objectToJson = object.toJSON
  if (objectToJson) {
    delete object.toJSON
    return () => {
      object.toJSON = objectToJson
    }
  }
  return noop
}
