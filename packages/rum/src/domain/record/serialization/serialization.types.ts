import type { NodePrivacyLevel } from '@datadog/browser-rum-core'

// Those values are the only one that can be used when inheriting privacy levels from parent to
// children during serialization, since HIDDEN and IGNORE shouldn't serialize their children. This
// ensures that no children are serialized when they shouldn't.
export type ParentNodePrivacyLevel =
  | typeof NodePrivacyLevel.ALLOW
  | typeof NodePrivacyLevel.MASK
  | typeof NodePrivacyLevel.MASK_USER_INPUT
  | typeof NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED

/**
 * Virtual attributes. These attributes appear in the serialized attribute map of
 * elements, but they're not actually derived from the DOM; they're used to represent
 * metadata about the element they're attached to.
 */
export interface VirtualAttributes {
  /**
   * For <style> and <link> elements, the rules in the element's stylesheet, extracted
   * from the CSSOM.
   */
  _cssText?: string

  /** For <audio> and <video> elements, the playback state of the element's media. */
  rr_mediaState?: 'paused' | 'played'

  /** For elements which are scroll containers, the element's X scroll position, if non-zero. */
  rr_scrollLeft?: number

  /** For elements which are scroll containers, the element's Y scroll position, if non-zero. */
  rr_scrollTop?: number

  /** For HIDDEN elements, the width of the element's bounding client rect. */
  rr_width?: string

  /** For HIDDEN elements, the height of the element's bounding client rect. */
  rr_height?: string
}
