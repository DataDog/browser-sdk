import type { NodePrivacyLevel } from '@datadog/browser-rum-core'

// Those values are the only one that can be used when inheriting privacy levels from parent to
// children during serialization, since HIDDEN and IGNORE shouldn't serialize their children. This
// ensures that no children are serialized when they shouldn't.
export type ParentNodePrivacyLevel =
  | typeof NodePrivacyLevel.ALLOW
  | typeof NodePrivacyLevel.MASK
  | typeof NodePrivacyLevel.MASK_USER_INPUT
  | typeof NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED
