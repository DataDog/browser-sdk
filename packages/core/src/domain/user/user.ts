import type { Context } from '../../tools/context'
import { assign } from '../../tools/utils'

/**
 * Clone input data and ensure known user properties (id, name, email)
 * are strings, as defined here:
 * https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention/#user-related-attributes
 */
export function sanitizeUser(newUser: Context) {
  const shallowClonedUser = assign({}, newUser)
  if ('id' in shallowClonedUser) {
    shallowClonedUser.id = String(shallowClonedUser.id)
  }
  if ('name' in shallowClonedUser) {
    shallowClonedUser.name = String(shallowClonedUser.name)
  }
  if ('email' in shallowClonedUser) {
    shallowClonedUser.email = String(shallowClonedUser.email)
  }
  return shallowClonedUser
}
