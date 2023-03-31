import type { Context } from '../../tools/context'
import { display } from '../../tools/display'
import { assign, getType } from '../../tools/utils'
import type { User } from './user.types'

/**
 * Clone input data and ensure known user properties (id, name, email)
 * are strings, as defined here:
 * https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention/#user-related-attributes
 */
export function sanitizeUser(newUser: Context): Context {
  // We shallow clone only to prevent mutation of user data.
  const user = assign({}, newUser)
  const keys = ['id', 'name', 'email']
  keys.forEach((key) => {
    if (key in user) {
      user[key] = String(user[key])
    }
  })
  return user
}

/**
 * Simple check to ensure user is valid
 */
export function checkUser(newUser: User): boolean {
  const isValid = getType(newUser) === 'object'
  if (!isValid) {
    display.error('Unsupported user:', newUser)
  }
  return isValid
}
