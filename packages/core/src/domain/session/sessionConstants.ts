import { ONE_HOUR, ONE_MINUTE, ONE_YEAR } from '../../tools/utils/timeUtils'

export const SESSION_TIME_OUT_DELAY = 4 * ONE_HOUR
export const SESSION_EXPIRATION_DELAY = 15 * ONE_MINUTE
export const SESSION_COOKIE_EXPIRATION_DELAY = ONE_YEAR
export const SESSION_NOT_TRACKED = '0'

/**
 * @internal
 */
export const SessionPersistence = {
  COOKIE: 'cookie',
  IN_MEMORY: 'in-memory',
  LOCAL_STORAGE: 'local-storage',
} as const

/**
 * @inline
 */
export type SessionPersistence = (typeof SessionPersistence)[keyof typeof SessionPersistence]
