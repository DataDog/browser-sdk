import type { Context } from '../../tools/context'
import { deepClone } from '../../tools/utils'

/**
 * Clone input data and ensure known user properties (id, name, email)
 * are strings, as defined here:
 * https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention/#user-related-attributes
 */
export function sanitizeUser(newUser: Context): Context {
  const user = deepClone(newUser)
  const keys = ['id', 'name', 'email']
  keys.forEach((key) => {
    if (key in user) {
      user[key] = String(user[key])
    }
  })
  return user
}
