import type { Context } from '../../tools/serialisation/context'
import { sanitizeContext } from '../context/contextUtils'

export function sanitizeUser(newUser: Context) {
  return sanitizeContext(newUser, ['id', 'name', 'email'])
}

export function generateAnonymousId() {
  return Math.floor(Math.random() * Math.pow(36, 10))
    .toString(36)
    .padStart(10, '0')
}
