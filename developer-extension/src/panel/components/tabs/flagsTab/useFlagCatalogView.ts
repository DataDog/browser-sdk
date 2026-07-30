import { useEffect, useMemo, useState } from 'react'
import type { FlagCatalogRequest } from './flagsRequests'

const CATALOG_PAGE_SIZE = 20
// Wait out a typing burst before sending a search to the server, so we don't fire a request per
// keystroke. Short enough to still feel responsive.
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
 * `currentUserId` backs the "My feature flags" filter, which the server applies by `created_by`
 * UUID. It's null until the identity lookup resolves (and stays null if it fails), so while the user
 * is unknown the toggle contributes no filter — the UI disables it rather than letting it silently
 * empty the list (see flagFilterBar).
 */
export function useFlagCatalogView(currentUserId: string | null): FlagCatalogView {
  const [search, setSearchState] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilterState] = useState<string[]>([])
  const [tagFilter, setTagFilterState] = useState<string[]>([])
  const [myFlagsOnly, setMyFlagsOnlyState] = useState(false)
  const [teamFilter, setTeamFilterState] = useState<string[]>([])
  const [page, setPage] = useState(1)

  // Feed the server the debounced term, not the live one.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  // "My feature flags" filters by the signed-in user's creator UUID server-side. With no known user
  // it resolves to no filter (the UI disables the toggle in that case). Deriving it here — rather than
  // depending on currentUserId in the memo — keeps the request identity stable when the toggle is off,
  // so identity resolving after connect doesn't trigger a redundant refetch.
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
  return {
    search,
    setSearch: (value) => {
      setSearchState(value)
      setPage(1)
    },
    typeFilter,
    setTypeFilter: (value) => {
      setTypeFilterState(value)
      setPage(1)
    },
    tagFilter,
    setTagFilter: (value) => {
      setTagFilterState(value)
      setPage(1)
    },
    myFlagsOnly,
    setMyFlagsOnly: (value) => {
      setMyFlagsOnlyState(value)
      setPage(1)
    },
    teamFilter,
    setTeamFilter: (value) => {
      setTeamFilterState(value)
      setPage(1)
    },
    page,
    setPage,
    pageSize: CATALOG_PAGE_SIZE,
    request,
  }
}
