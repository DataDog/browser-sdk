import { Box, Group, Pagination, Space } from '@mantine/core'
import React, { useEffect, useState } from 'react'
import { TabBase } from '../../tabBase'
import { useFlagCatalog } from './useFlagCatalog'
import { useFlagCatalogView } from './useFlagCatalogView'
import type { FlagAuthState } from './useFlagAuth'
import { useFlagAuth } from './useFlagAuth'
import { ConnectScreen, ConnectionHeader } from './connectScreen'
import { FlagCatalogBody } from './flagCatalogList'
import { FlagFilterBar } from './flagFilterBar'

export function FlagsTab() {
  const auth = useFlagAuth()

  // Gate the whole tab: nothing shows until the user connects via OAuth.
  if (!auth.isConnected) {
    return (
      <TabBase>
        <ConnectScreen auth={auth} />
      </TabBase>
    )
  }

  // Remount the catalog on site change so filters, pagination, and accumulated tag suggestions don't
  // carry over from a previously-connected org — stale filters would misleadingly empty the new
  // catalog, and stale suggestions would leak the old org's tags into autocomplete.
  return <ConnectedCatalog key={auth.site} auth={auth} />
}

function ConnectedCatalog({ auth }: { auth: FlagAuthState }) {
  const view = useFlagCatalogView()
  const catalog = useFlagCatalog(auth, view.request)
  const { setPage } = view

  const totalPages = Math.max(1, Math.ceil(catalog.total / view.pageSize))

  // If the catalog shrinks (e.g. flags archived) so there are fewer pages than the selected one,
  // snap back to the last page — Mantine's Pagination won't clamp an out-of-range value itself.
  useEffect(() => {
    if (view.page > totalPages) {
      setPage(totalPages)
    }
  }, [view.page, totalPages, setPage])

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

  return (
    <TabBase
      top={
        // No dd-privacy-allow here: the header/filter/catalog below render customer flag names,
        // values, and tags, which must stay masked in the extension's own Session Replay.
        <Box px="md">
          <ConnectionHeader auth={auth} />
          <Space h="sm" />
          <FlagFilterBar view={view} tagSuggestions={tagSuggestions} />
        </Box>
      }
    >
      <Box px="md" py="sm">
        <FlagCatalogBody catalog={catalog} flags={catalog.flags} total={catalog.total} />

        {totalPages > 1 && (
          <>
            <Space h="sm" />
            <Group justify="center">
              <Pagination size="xs" color="violet" total={totalPages} value={view.page} onChange={view.setPage} />
            </Group>
          </>
        )}
      </Box>
    </TabBase>
  )
}
