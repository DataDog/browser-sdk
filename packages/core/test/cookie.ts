import { setCookie } from '../src/browser/cookie'
import { SESSION_STORE_KEY } from '../src/domain/session/storeStrategies/sessionStoreStrategy'
import { ONE_MINUTE } from '../src/tools/utils/timeUtils'

export function expireCookie() {
  setCookie(SESSION_STORE_KEY, 'isExpired=1', ONE_MINUTE)
}
