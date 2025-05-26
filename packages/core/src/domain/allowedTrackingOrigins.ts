import { display } from '../tools/display'
import { matchList } from '../tools/matchOption'
import type { InitConfiguration } from './configuration'
import {
  WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN,
  WARN_NOT_ALLOWED_TRACKING_ORIGIN,
  isUnsupportedExtensionEnvironment,
} from './extension/extensionUtils'

export function isAllowedTrackingOrigins(
  configuration: InitConfiguration,
  windowLocation = typeof location !== 'undefined' ? location.href : '',
  errorStack?: string
): boolean {
  const allowedTrackingOrigins = configuration.allowedTrackingOrigins
  if (!allowedTrackingOrigins) {
    if (isUnsupportedExtensionEnvironment(windowLocation, errorStack)) {
      display.warn(WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN)
      // TODO(next major): make `allowedTrackingOrigins` required in unsupported extension environments
    }
    return true
  }

  const isAllowed = matchList(allowedTrackingOrigins, windowLocation, true)
  if (!isAllowed) {
    display.warn(WARN_NOT_ALLOWED_TRACKING_ORIGIN)
  }
  return isAllowed
}
