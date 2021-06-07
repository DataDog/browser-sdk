export { RumUserConfiguration, RumPublicApi, makeRumPublicApi, StartRum } from './boot/rumPublicApi'
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
export { ViewContext, CommonContext } from './rawRumEvent.types'
export { startRum } from './boot/rum'
export { LifeCycle, LifeCycleEventType } from './domain/lifeCycle'
export { ParentContexts } from './domain/parentContexts'
export { RumSession } from './domain/rumSession'
export { getMutationObserverConstructor } from './browser/domMutationObservable'
