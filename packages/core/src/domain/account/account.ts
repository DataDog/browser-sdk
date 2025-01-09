import type { Context } from '../../tools/serialisation/context'
import { sanitizeContext } from '../context/contextUtils'

export interface Account {
  id?: string | undefined
  name?: string | undefined
  [key: string]: unknown
}

export function sanitizeAccount(newAccount: Context) {
  return sanitizeContext(newAccount, ['id', 'name'])
}
