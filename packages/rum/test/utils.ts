/**
 * Simplify asserting record lengths across multiple devices when not all record types are supported
 */
export const recordsPerFullSnapshot = () =>
  // Meta, Focus, FullSnapshot, VisualViewport (support limited)
  window.visualViewport ? 4 : 3
