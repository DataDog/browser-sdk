// Keep the following in sync with packages/rum/src/index.ts
export { datadogRum } from './boot/recorder.entry'
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

export {
  Segment as internal_Segment,
  CreationReason as internal_CreationReason,
  IncrementalSource as internal_IncrementalSource,
  RecordType as internal_RecordType,
} from './types'
