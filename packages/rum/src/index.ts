// Keep the following in sync with packages/rum-recorder/src/index.ts
export { datadogRum } from './boot/rum.entry'
export {
  CommonProperties,
  ProvidedSource,
  RumPublicApi as RumGlobal,
  RumUserConfiguration,
  // Events
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
} from '@datadog/browser-rum-core'
