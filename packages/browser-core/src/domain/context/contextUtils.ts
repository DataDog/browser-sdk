import type { Context } from '../../tools/serialisation/context'
import { display } from '../../tools/display'
import { getType } from '../../tools/utils/typeUtils'

/**
 * Simple check to ensure an object is a valid context
 */
export function checkContext(maybeContext: unknown): maybeContext is Context {
  const isValid = getType(maybeContext) === 'object'
  if (!isValid) {
    display.error('Unsupported context:', maybeContext)
  }
  return isValid
}
