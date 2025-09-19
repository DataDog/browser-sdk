import { display } from '../tools/display'
import { matchList } from '../tools/matchOption'
import type { InitConfiguration } from './configuration'
import { isUnsupportedExtensionEnvironment } from './extension/extensionUtils'

export const WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN =
  'Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
export const ERROR_NOT_ALLOWED_TRACKING_ORIGIN = 'SDK initialized on a non-allowed domain.'

export function isAllowedTrackingOrigins(
  configuration: InitConfiguration,
  windowOrigin = typeof location !== 'undefined' ? location.origin : '',
  errorStack = new Error().stack
): boolean {
  const allowedTrackingOrigins = configuration.allowedTrackingOrigins
  if (!allowedTrackingOrigins) {
    if (isUnsupportedExtensionEnvironment(windowOrigin, errorStack)) {
      // TODO(next major): make `allowedTrackingOrigins` required in unsupported extension environments
      display.warn(WARN_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN)
    }
    return true
  }

  const isAllowed = matchList(allowedTrackingOrigins, windowOrigin)
  if (!isAllowed) {
    display.error(ERROR_NOT_ALLOWED_TRACKING_ORIGIN)
  }
  return isAllowed
}
