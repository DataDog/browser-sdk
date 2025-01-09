import type { Context } from '../../tools/serialisation/context'
import { display } from '../../tools/display'
import { getType } from '../../tools/utils/typeUtils'
import { assign } from '../../tools/utils/polyfills'

/**
 * Clone input data and ensure known context properties
 * are strings, as defined here:
 * https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention/#user-related-attributes
 */
export function sanitizeContext(newContext: Context, keys: string[]): Context {
  // We shallow clone only to prevent mutation of context data.
  const context = assign({}, newContext)
  keys.forEach((key) => {
    if (key in context) {
      /* eslint-disable @typescript-eslint/no-base-to-string */
      context[key] = String(context[key])
    }
  })
  return context
}

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
