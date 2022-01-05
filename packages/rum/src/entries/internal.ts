/**
 * Entry point consumed by the Datadog Web app to mutualize some types, constant and logic for
 * tests.
 *
 * WARNING: this module is not intended for public usages, and won't follow semver for breaking
 * changes.
 */
export {
  MutationData,
  MousemoveData,
  MouseInteractionData,
  ScrollData,
  ViewportResizeData,
  InputData,
  MediaInteractionData,
  StyleSheetRuleData,
  MediaInteractions,
  MouseInteractions,
  AddedNodeMutation,
  MousePosition,
  RemovedNodeMutation,
} from '../domain/record'

export { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN, PRIVACY_CLASS_HIDDEN, NodePrivacyLevel } from '../constants'

export * from '../types'

export { serializeNodeWithId } from '../domain/record'
