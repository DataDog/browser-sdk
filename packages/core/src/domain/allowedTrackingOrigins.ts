import { display } from '../tools/display'
import { getGlobalObject } from '../tools/globalObject'
import { matchList } from '../tools/matchOption'
import { mockable } from '../tools/mockable'
import type { InitConfiguration } from './configuration'
import { isUnsupportedExtensionEnvironment } from './extension/extensionUtils'

export const ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN =
  'Running the Browser SDK in a Web extension content script is forbidden unless the `allowedTrackingOrigins` option is provided.'
export const ERROR_NOT_ALLOWED_TRACKING_ORIGIN = 'SDK initialized on a non-allowed domain.'

export function isAllowedTrackingOrigins(configuration: InitConfiguration, errorStack: string): boolean {
  const location = mockable(getGlobalObject().location)
  const windowOrigin = location ? location.origin : ''
  const allowedTrackingOrigins = configuration.allowedTrackingOrigins
  if (!allowedTrackingOrigins) {
    if (isUnsupportedExtensionEnvironment(windowOrigin, errorStack)) {
      display.error(ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN)

      return false
    }
    return true
  }

  const isAllowed = matchList(allowedTrackingOrigins, windowOrigin)
  if (!isAllowed) {
    display.error(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
  }
  return isAllowed
}
