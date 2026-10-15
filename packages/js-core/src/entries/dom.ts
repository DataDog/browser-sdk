export { fetch } from '../dom/fetch'

export { createDOMMutationObservable, getMutationObserverConstructor } from '../dom/domMutationObservable'
export type {
  MutationRecord,
  CharacterDataMutationRecord,
  AttributesMutationRecord,
  ChildListMutationRecord,
} from '../dom/domMutationObservable'

export type { TrustableEvent } from '../dom/addEventListener'

export { DOM_EVENT } from '../dom/addEventListener'

export {
  addEventListener,
  addEventListeners,
  isEventSupported,
  setAllowUntrustedEvents,
  resetAllowUntrustedEvents,
} from '../dom/addEventListener'
