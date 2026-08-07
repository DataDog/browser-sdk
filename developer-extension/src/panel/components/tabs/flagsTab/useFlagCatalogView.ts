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
  page: number
  setPage: (value: number) => void
  pageSize: number
  // The filters + pagination to send to the server. Stable across renders unless a field changes.
  request: FlagCatalogRequest
}

/**
 * Owns the catalog's search/filter/pagination state and turns it into a server request. Filtering
 * and pagination happen server-side (see useFlagCatalog), so this holds no flag data itself.
 */
export function useFlagCatalogView(): FlagCatalogView {
  const [search, setSearchState] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilterState] = useState<string[]>([])
  const [tagFilter, setTagFilterState] = useState<string[]>([])
  const [page, setPage] = useState(1)

  // Feed the server the debounced term, not the live one.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  const request = useMemo<FlagCatalogRequest>(
    () => ({ page, pageSize: CATALOG_PAGE_SIZE, search: debouncedSearch, typeFilter, tagFilter }),
    [page, debouncedSearch, typeFilter, tagFilter]
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
    page,
    setPage,
    pageSize: CATALOG_PAGE_SIZE,
    request,
  }
}
