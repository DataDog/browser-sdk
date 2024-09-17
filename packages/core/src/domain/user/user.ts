import type { Context } from '../../tools/serialisation/context'
import { SESSION_STORE_KEY } from '../session/storeStrategies/sessionStoreStrategy'
import { display } from '../../tools/display'
import { getType } from '../../tools/utils/typeUtils'
import { assign } from '../../tools/utils/polyfills'
import { getCookie, setCookie } from '../../browser/cookie'
import { isValidSessionString } from '../session/sessionStateValidation'
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

export function getAnonymousIdFromStorage(): string | undefined {
  let matches = /device=([\w-]+)/.exec(document.cookie)
  if (matches) {
    return matches[1]
  }

  matches = /device=(\w+)/.exec(localStorage.getItem(SESSION_STORE_KEY) ?? '')
  if (matches) {
    return matches[1]
  }
}

export function setAnonymousIdInStorage(sessionStoreStrategyType: string, device: string) {
  let sessionString =
    sessionStoreStrategyType === 'Cookie' ? getCookie(SESSION_STORE_KEY) : localStorage.getItem(SESSION_STORE_KEY)
  sessionString = isValidSessionString(sessionString) ? `${sessionString}&device=${device}` : `device=${device}`

  if (sessionStoreStrategyType === 'Cookie') {
    setCookie(SESSION_STORE_KEY, sessionString)
  } else {
    localStorage.setItem(SESSION_STORE_KEY, sessionString)
  }
}

export function retrieveAnonymousId(sessionStoreStrategyType: string): string {
  let anonymousId = getAnonymousIdFromStorage()

  if (!anonymousId) {
    anonymousId = generateAnonymousId()
    setAnonymousIdInStorage(sessionStoreStrategyType, anonymousId)
  }
  return anonymousId
}

export function generateAnonymousId() {
  return Math.floor(Math.random() * Math.pow(2, 53)).toString(36)
}
