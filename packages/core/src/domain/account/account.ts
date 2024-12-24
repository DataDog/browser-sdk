import type { Context } from '../../tools/serialisation/context'
import { sanitizeContext } from '../context/contextUtils'

export function sanitizeAccount(newAccount: Context) {
  return sanitizeContext(newAccount, ['id', 'name'])
}
