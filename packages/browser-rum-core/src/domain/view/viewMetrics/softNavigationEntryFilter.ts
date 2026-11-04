/**
 * Picks the entries counted by a metric of a route_change view tracked with the Soft Navigation API
 * (see trackRouteChangeViewMetrics).
 *
 * Every entry counts until the view's soft-navigation entry arrives. From then on, only the entries
 * from that navigation onward do (navigation ids only grow), which also drops the ones already
 * counted from before it, like a layout shift caused by the previous page's leftover DOM. To
 * recompute the metric without keeping every entry around, only the entries from a later navigation
 * than the view's first entry are kept, until the soft-navigation entry arrives.
 */
export function createSoftNavigationEntryFilter<Entry extends { navigationId?: number }>(
  isSoftNavigationTracked: boolean
) {
  let firstNavigationId: number | undefined
  let minNavigationId: number | undefined
  let laterEntries: Entry[] = []

  return {
    accept(entry: Entry) {
      const { navigationId } = entry
      if (!isSoftNavigationTracked || navigationId === undefined) {
        return true
      }
      if (minNavigationId !== undefined) {
        return navigationId >= minNavigationId
      }
      if (firstNavigationId === undefined) {
        firstNavigationId = navigationId
      } else if (navigationId > firstNavigationId) {
        laterEntries.push(entry)
      }
      return true
    },

    setNavigationId(navigationId: number, recompute: (entries: Entry[]) => void) {
      const entries = laterEntries
      laterEntries = []
      minNavigationId = navigationId
      if (firstNavigationId !== undefined && navigationId > firstNavigationId) {
        recompute(entries.filter((entry) => entry.navigationId! >= navigationId))
      }
    },
  }
}
