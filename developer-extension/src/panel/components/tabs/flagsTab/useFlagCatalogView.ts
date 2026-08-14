import { useEffect, useMemo, useState } from 'react'
import type { FlagCatalogRequest } from './flagsRequests'

const CATALOG_PAGE_SIZE = 20
// Long enough to wait out a typing burst, short enough to still feel responsive.
const SEARCH_DEBOUNCE_MS = 400

export interface FlagCatalogView {
  search: string
  setSearch: (value: string) => void
  typeFilter: string[]
  setTypeFilter: (value: string[]) => void
  tagFilter: string[]
  setTagFilter: (value: string[]) => void
  myFlagsOnly: boolean
  setMyFlagsOnly: (value: boolean) => void
  teamFilter: string[]
  setTeamFilter: (value: string[]) => void
  page: number
  setPage: (value: number) => void
  pageSize: number
  // The filters + pagination to send to the server. Stable across renders unless a field changes.
  request: FlagCatalogRequest
}

/**
 * Owns the catalog's search/filter/pagination state and turns it into a server request. Filtering
 * and pagination happen server-side (see useFlagCatalog), so this holds no flag data itself.
 *
 * `currentUserId` backs the "My feature flags" filter (server-side `created_by`). It's null until the
 * separate identity fetch resolves, and stays null if that fetch fails — so while the user is unknown
 * the toggle adds no filter (the UI disables it rather than silently emptying the list).
 */
export function useFlagCatalogView(currentUserId: string | null): FlagCatalogView {
  const [search, setSearchState] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilterState] = useState<string[]>([])
  const [tagFilter, setTagFilterState] = useState<string[]>([])
  const [myFlagsOnly, setMyFlagsOnlyState] = useState(false)
  const [teamFilter, setTeamFilterState] = useState<string[]>([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  // Derived outside the memo so the request stays unchanged while the toggle is off — otherwise
  // identity resolving a moment after connect would trigger a needless refetch.
  const createdBy = myFlagsOnly && currentUserId ? currentUserId : null
  const request = useMemo<FlagCatalogRequest>(
    () => ({
      page,
      pageSize: CATALOG_PAGE_SIZE,
      search: debouncedSearch,
      typeFilter,
      tagFilter,
      teamFilter,
      createdBy,
    }),
    [page, debouncedSearch, typeFilter, tagFilter, teamFilter, createdBy]
  )

  // Any filter/search change resets to the first page so results aren't hidden on an out-of-range page.
  const withPageReset =
    <T>(setState: (value: T) => void) =>
    (value: T) => {
      setState(value)
      setPage(1)
    }

  return {
    search,
    setSearch: withPageReset(setSearchState),
    typeFilter,
    setTypeFilter: withPageReset(setTypeFilterState),
    tagFilter,
    setTagFilter: withPageReset(setTagFilterState),
    myFlagsOnly,
    setMyFlagsOnly: withPageReset(setMyFlagsOnlyState),
    teamFilter,
    setTeamFilter: withPageReset(setTeamFilterState),
    page,
    setPage,
    pageSize: CATALOG_PAGE_SIZE,
    request,
  }
}
