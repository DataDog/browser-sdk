export type { Configuration, InitConfiguration } from './configuration'
export {
  DefaultPrivacyLevel,
  TraceContextInjection,
  serializeConfiguration,
  BROWSER_CORE_SCHEMA,
} from './configuration'
export { buildCookieOptions } from '../../browser/cookie'
export { isAllowedTrackingOrigins } from '../allowedTrackingOrigins'
