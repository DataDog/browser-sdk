export { RumUserConfiguration, RumGlobal, makeRumGlobal } from './boot/rum.entry'
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
export { startRum } from './boot/rum'
