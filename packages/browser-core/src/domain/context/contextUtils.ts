import { getType } from '@datadog/js-core/util'
import type { Context } from '@datadog/js-core/assembly'
import { display } from '../../tools/display'

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
