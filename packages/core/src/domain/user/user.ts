import { display } from '../../tools/display'
import { getType } from '../../tools/utils/typeUtils'
import type { User } from './user.types'

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
