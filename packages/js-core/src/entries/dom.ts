export { fetch } from '../util/fetch'
export type { Subscription } from '../util/observable'
export { Observable, BufferedObservable, mergeObservables } from '../util/observable'
export type { TrustableEvent } from '../util/addEventListener'
export { DOM_EVENT } from '../util/addEventListener'
export {
  addEventListener,
  addEventListeners,
  isEventSupported,
  setAllowUntrustedEvents,
  resetAllowUntrustedEvents,
} from '../util/addEventListener'
export { createDOMMutationObservable, getMutationObserverConstructor } from '../util/domMutationObservable'
export type {
  RumMutationRecord,
  RumCharacterDataMutationRecord,
  RumAttributesMutationRecord,
  RumChildListMutationRecord,
} from '../util/domMutationObservable'
