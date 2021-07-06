// Keep the following in sync with packages/rum-recorder/src/index.ts
export { datadogRum } from './boot/rum.entry'
export {
  CommonProperties,
  ProvidedSource,
  RumPublicApi as RumGlobal,
  RumInitConfiguration,
  RumUserConfiguration,
  // Events
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  // Events context
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@datadog/browser-rum-core'
