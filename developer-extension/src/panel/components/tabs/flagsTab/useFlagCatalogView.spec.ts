import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCleanupTask } from '../../../../../../packages/browser-core/test'
import type { FlagCatalogView } from './useFlagCatalogView'
import { useFlagCatalogView } from './useFlagCatalogView'

// Filtering happens server-side now (see flagCatalog.spec for the URL serialization), so these tests
// cover what the hook itself owns: turning filter/search/pagination state into the server `request`.
describe('useFlagCatalogView', () => {
  // Mounts the hook in a throwaway component and exposes its latest return value.
  function mountHook(currentUserId: string | null) {
    const container = document.createElement('div')
    const root = createRoot(container)
    let latest: FlagCatalogView
    function Probe() {
      latest = useFlagCatalogView(currentUserId)
      return null
    }
    act(() => root.render(React.createElement(Probe)))
    registerCleanupTask(() => act(() => root.unmount()))
    return () => latest
  }

  it('starts on page 1 with empty filters and no created_by', () => {
    const view = mountHook(null)()
    expect(view.request).toEqual({
      page: 1,
      pageSize: view.pageSize,
      search: '',
      typeFilter: [],
      tagFilter: [],
      teamFilter: [],
      createdBy: null,
    })
  })

  describe('"My feature flags" -> created_by', () => {
    it('sets created_by to the signed-in user while toggled on', () => {
      const get = mountHook('me')
      act(() => get().setMyFlagsOnly(true))
      expect(get().request.createdBy).toBe('me')
      act(() => get().setMyFlagsOnly(false))
      expect(get().request.createdBy).toBeNull()
    })

    it('contributes no created_by while the signed-in user is unknown', () => {
      const get = mountHook(null)
      act(() => get().setMyFlagsOnly(true))
      // The toggle reads as on, but with no user there's nothing to filter by — so the request stays open.
      expect(get().myFlagsOnly).toBe(true)
      expect(get().request.createdBy).toBeNull()
    })
  })

  it('carries selected team handles through to the request', () => {
    const get = mountHook(null)
    act(() => get().setTeamFilter(['alpha', 'beta']))
    expect(get().request.teamFilter).toEqual(['alpha', 'beta'])
  })

  it('resets to the first page when a filter changes', () => {
    const get = mountHook(null)
    act(() => get().setPage(4))
    expect(get().request.page).toBe(4)
    act(() => get().setTypeFilter(['BOOLEAN']))
    expect(get().request.page).toBe(1)
  })

  it('debounces the search term before putting it in the request', () => {
    jasmine.clock().install()
    registerCleanupTask(() => jasmine.clock().uninstall())

    const get = mountHook(null)
    act(() => get().setSearch('checkout'))
    // The live value updates immediately, but the request (sent to the server) waits out the debounce.
    expect(get().search).toBe('checkout')
    expect(get().request.search).toBe('')
    act(() => jasmine.clock().tick(400))
    expect(get().request.search).toBe('checkout')
  })
})
