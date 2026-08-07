import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CatalogFlag } from './flagsRequests'
import { getOverride, type FlagOverride, type FlagOverrides } from './inspectedPageFlags'
import type { FlagAuthState } from './useFlagAuth'
import { useFlagCatalog, type FlagCatalogState } from './useFlagCatalog'
import { useFlagCatalogView, type FlagCatalogView } from './useFlagCatalogView'
import { useFlagIdentity, type FlagIdentityState } from './useFlagIdentity'
import { useInspectedPageOverrides, type FlagPageStatus } from './useInspectedPageOverrides'
import { useOverriddenFlags } from './useOverriddenFlags'

// The connected Flags tab's state + actions, shared with every component below the provider so the
// tab and its components render state and invoke actions without prop-drilling.
export interface FlagsContextValue {
  view: FlagCatalogView
  // Signed-in user + team handles backing the "My feature flags" and "My teams" filters.
  identity: FlagIdentityState
  catalog: FlagCatalogState
  // Inspected-page override state (see useInspectedPageOverrides).
  overrideStatus: FlagPageStatus
  overrideError: string | null
  overrides: FlagOverrides
  devtoolsEnabled: boolean
  // The overridden flags' catalog data (pinned "Local overrides" section) and the current page minus
  // those (so they don't render twice).
  overriddenFlags: CatalogFlag[]
  bottomFlags: CatalogFlag[]
  tagSuggestions: string[]
  totalPages: number
  // Whether a refresh is needed/in flight to (re)apply overrides, and the last mutation failure.
  pendingReload: boolean
  writesInFlight: number
  mutationError: string | null
  applyOverride: (flagKey: string, override: FlagOverride) => void
  removeOverride: (flagKey: string) => void
  removeAll: () => void
  reload: () => void
}

const FlagsContext = createContext<FlagsContextValue | null>(null)

export function useFlagsContext(): FlagsContextValue {
  const value = useContext(FlagsContext)
  if (!value) {
    throw new Error('useFlagsContext must be used within <FlagsProvider>')
  }
  return value
}

/**
 * Owns the connected Flags tab's orchestration: loads the catalog, tracks inspected-page overrides,
 * resolves the overridden-flag metadata, and exposes the apply/revert/clear/reload actions. The tab
 * and its components consume this via useFlagsContext and stay focused on rendering.
 */
export function FlagsProvider({ auth, children }: { auth: FlagAuthState; children: ReactNode }) {
  // Identity resolves first: the catalog view needs the signed-in user's UUID for the "My feature
  // flags" (created_by) filter, and the filter bar needs the team handles for "My teams".
  const identity = useFlagIdentity(auth)
  const view = useFlagCatalogView(identity.userId)
  const catalog = useFlagCatalog(auth, view.request)
  const { setPage } = view
  const { status, error, overrides, devtoolsEnabled, setOverride, clearOverride, clearAll, reloadPage } =
    useInspectedPageOverrides()

  const totalPages = Math.max(1, Math.ceil(catalog.total / view.pageSize))

  // If the catalog shrinks (e.g. flags archived) so there are fewer pages than the selected one,
  // snap back to the last page — Mantine's Pagination won't clamp an out-of-range value itself.
  useEffect(() => {
    if (view.page > totalPages) {
      setPage(totalPages)
    }
  }, [view.page, totalPages, setPage])

  // "Local overrides" is its own always-visible section above the paginated list. Fetch each
  // overridden flag by key so it shows regardless of which catalog page it's on, then fall back to a
  // minimal row for any key that no longer resolves to a flag (so it can still be reverted).
  const overrideKeys = useMemo(() => Object.keys(overrides), [overrides])
  const overriddenCatalogFlags = useOverriddenFlags(auth, overrideKeys)
  const overriddenFlags = useMemo<CatalogFlag[]>(
    () =>
      overrideKeys.map(
        (key) =>
          overriddenCatalogFlags.find((flag) => flag.key === key) ?? {
            key,
            name: key,
            description: '',
            type: overrides[key].type,
            variants: [],
            tags: [],
          }
      ),
    [overrideKeys, overriddenCatalogFlags, overrides]
  )
  // Drop overridden flags from the paginated list so they don't show twice (they're in the top section).
  const bottomFlags = useMemo(
    () => catalog.flags.filter((flag) => !getOverride(overrides, flag.key)),
    [catalog.flags, overrides]
  )

  // Progressive tag suggestions: there's no tags endpoint and we only load a page at a time, so the
  // Tag filter's autocomplete is built from the tags seen on pages loaded so far. `team:*` tags are
  // excluded (they'd drive a separate team filter); users can still type any tag not yet seen.
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  useEffect(() => {
    setTagSuggestions((previous) => {
      const seen = new Set(previous)
      for (const flag of catalog.flags) {
        for (const tag of flag.tags) {
          if (!tag.startsWith('team:')) {
            seen.add(tag)
          }
        }
      }
      // Keep the same array (skip the re-render) when this page added no new tags.
      return seen.size === previous.length ? previous : Array.from(seen).sort((a, b) => a.localeCompare(b))
    })
  }, [catalog.flags])

  const [pendingReload, setPendingReload] = useState(false)
  const [writesInFlight, setWritesInFlight] = useState(0)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // Each override write is an async read-modify-write to the inspected page's localStorage. Track how
  // many are in flight so the reload button stays disabled until they settle — reloading earlier would
  // boot the DatadogDevtools wrapper with stale overrides that hadn't been written yet.
  const runMutation = useCallback((write: Promise<void>) => {
    setMutationError(null)
    setWritesInFlight((count) => count + 1)
    write
      .then(() => setPendingReload(true))
      .catch((error: unknown) => setMutationError(error instanceof Error ? error.message : String(error)))
      .finally(() => setWritesInFlight((count) => count - 1))
  }, [])

  const applyOverride = useCallback(
    (flagKey: string, override: FlagOverride) => runMutation(setOverride(flagKey, override)),
    [runMutation, setOverride]
  )
  const removeOverride = useCallback(
    (flagKey: string) => runMutation(clearOverride(flagKey)),
    [runMutation, clearOverride]
  )
  const removeAll = useCallback(() => runMutation(clearAll()), [runMutation, clearAll])
  const reload = useCallback(() => {
    reloadPage()
    setPendingReload(false)
  }, [reloadPage])

  const value = useMemo<FlagsContextValue>(
    () => ({
      view,
      identity,
      catalog,
      overrideStatus: status,
      overrideError: error,
      overrides,
      devtoolsEnabled,
      overriddenFlags,
      bottomFlags,
      tagSuggestions,
      totalPages,
      pendingReload,
      writesInFlight,
      mutationError,
      applyOverride,
      removeOverride,
      removeAll,
      reload,
    }),
    [
      view,
      identity,
      catalog,
      status,
      error,
      overrides,
      devtoolsEnabled,
      overriddenFlags,
      bottomFlags,
      tagSuggestions,
      totalPages,
      pendingReload,
      writesInFlight,
      mutationError,
      applyOverride,
      removeOverride,
      removeAll,
      reload,
    ]
  )

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>
}
