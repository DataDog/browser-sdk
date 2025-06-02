import { ONE_HOUR, ONE_MINUTE, ONE_YEAR } from '../../tools/utils/timeUtils'

export const SESSION_TIME_OUT_DELAY = 4 * ONE_HOUR
export const SESSION_EXPIRATION_DELAY = 15 * ONE_MINUTE
export const SESSION_COOKIE_EXPIRATION_DELAY = ONE_YEAR
export const SESSION_NOT_TRACKED = '0'

export const SessionPersistence = {
  COOKIE: 'cookie',
  LOCAL_STORAGE: 'local-storage',
} as const
export type SessionPersistence = (typeof SessionPersistence)[keyof typeof SessionPersistence]
