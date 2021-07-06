// Keep the following in sync with packages/rum/src/index.ts
export { datadogRum } from './boot/recorder.entry'
export {
  CommonProperties,
  ProvidedSource,
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

export {
  RumRecorderPublicApi as RumGlobal,
  RumRecorderInitConfiguration,
  RumRecorderUserConfiguration,
} from './boot/rumRecorderPublicApi'
