import type { Context } from '../../tools/serialisation/context'
import { display } from '../../tools/display'
import { getType } from '../../tools/utils/typeUtils'
import type { User } from './user.types'

/**
 * Clone input data and ensure known user properties (id, name, email)
 * are strings, as defined here:
 * https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention/#user-related-attributes
 */
export function sanitizeUser(newUser: Context): Context {
  // We shallow clone only to prevent mutation of user data.
  const user = { ...newUser }
  const keys = ['id', 'name', 'email']
  keys.forEach((key) => {
    if (key in user) {
      /* eslint-disable @typescript-eslint/no-base-to-string */
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

export function generateAnonymousId() {
  return Math.floor(Math.random() * Math.pow(36, 10))
    .toString(36)
    .padStart(10, '0')
}
