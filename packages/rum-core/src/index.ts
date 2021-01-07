export { RumUserConfiguration, RumPublicApi, makeRumPublicApi } from './boot/rumPublicApi'
export { ProvidedSource } from './domain/rumEventsCollection/error/errorCollection'
export {
  RumEvent,
  RumActionEvent,
  CommonProperties,
  RumErrorEvent,
  RumViewEvent,
  RumResourceEvent,
  RumLongTaskEvent,
} from './rumEvent.types'
export { CommonContext } from './rawRumEvent.types'
export { startRum } from './boot/rum'
export { LifeCycle, LifeCycleEventType } from './domain/lifeCycle'
export { ParentContexts } from './domain/parentContexts'
