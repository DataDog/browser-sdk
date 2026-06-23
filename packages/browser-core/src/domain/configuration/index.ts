export type { Configuration, InitConfiguration } from './configuration'
export {
  DefaultPrivacyLevel,
  TraceContextInjection,
  isSampleRate,
  validateAndBuildConfiguration,
  serializeConfiguration,
} from './configuration'
export { buildCookieOptions } from '../../browser/cookie'
