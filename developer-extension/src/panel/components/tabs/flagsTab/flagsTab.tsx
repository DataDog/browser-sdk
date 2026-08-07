import { Alert, Anchor, Box, Button, Code, Group, Pagination, Space } from '@mantine/core'
import React, { useState } from 'react'
import { TabBase } from '../../tabBase'
import { ConnectScreen, ConnectionHeader } from './connectScreen'
import { FlagCatalogBody, OverridesSection } from './flagCatalogList'
import { FlagFilterBar } from './flagFilterBar'
import { FlagsProvider, useFlagsContext } from './flagsContext'
import { ManualOverrideForm } from './manualOverrideForm'
import type { FlagAuthState } from './useFlagAuth'
import { useFlagAuth } from './useFlagAuth'

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

  // Remount the provider on site change so filters, pagination, overrides, and accumulated tag
  // suggestions don't carry over from a previously-connected org — stale filters would misleadingly
  // empty the new catalog, and stale suggestions would leak the old org's tags into autocomplete.
  return (
    <FlagsProvider key={auth.site} auth={auth}>
      <ConnectedFlagsTab auth={auth} />
    </FlagsProvider>
  )
}

function ConnectedFlagsTab({ auth }: { auth: FlagAuthState }) {
  const {
    overrideStatus,
    overrideError,
    overrides,
    devtoolsEnabled,
    overriddenFlags,
    totalPages,
    view,
    pendingReload,
    writesInFlight,
    mutationError,
    removeAll,
    reload,
  } = useFlagsContext()
  const [addOpen, setAddOpen] = useState(false)

  const overrideCount = Object.keys(overrides).length

  return (
    <TabBase
      top={
        // No dd-privacy-allow here: the header/filter/catalog below render customer flag names,
        // values, and tags, which must stay masked in the extension's own Session Replay.
        <Box px="md">
          <ConnectionHeader auth={auth} />
          <Space h="sm" />
          <FlagFilterBar />
        </Box>
      }
    >
      <Box px="md" py="sm">
        {mutationError && (
          <>
            <Alert color="red" title="Failed to update overrides">
              {mutationError}
            </Alert>
            <Space h="sm" />
          </>
        )}

        {overrideStatus === 'error' && overrideError && (
          <>
            <Alert color="red" title="Couldn't read the page">
              {overrideError}
            </Alert>
            <Space h="sm" />
          </>
        )}

        {overrideStatus === 'ready' && !devtoolsEnabled && (
          <>
            <Alert color="orange" title="DatadogDevtools not detected">
              The <Code>DatadogDevtools</Code> provider wrapper was not detected on this page. Overrides will only take
              effect once the page composes it. You can still set overrides — they'll apply when the wrapper is in
              place.
            </Alert>
            <Space h="sm" />
          </>
        )}

        <OverridesSection />
        {overriddenFlags.length > 0 && <Space h="md" />}

        <FlagCatalogBody />

        {totalPages > 1 && (
          <>
            <Space h="sm" />
            <Group justify="center">
              <Pagination size="xs" color="violet" total={totalPages} value={view.page} onChange={view.setPage} />
            </Group>
          </>
        )}

        <Space h="md" />
        <Group justify="space-between">
          <Button
            size="xs"
            variant="light"
            color="red"
            onClick={removeAll}
            disabled={overrideCount === 0 || overrideStatus !== 'ready'}
          >
            Clear all{overrideCount > 0 ? ` (${overrideCount})` : ''}
          </Button>
          <Button
            color="violet"
            onClick={reload}
            // Overrides are written to localStorage immediately, so this button only reloads the page
            // to (re)apply them. Enable it whenever there are overrides to apply or a change to flush,
            // but never while a write is still in flight (it would reload with stale state).
            disabled={overrideStatus !== 'ready' || writesInFlight > 0 || (overrideCount === 0 && !pendingReload)}
          >
            Refresh Page
          </Button>
        </Group>

        <Space h="md" />
        <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => setAddOpen((open) => !open)}>
          {addOpen ? '− Hide custom override' : '+ Add a custom override'}
        </Anchor>
        {addOpen && (
          <>
            <Space h="sm" />
            <ManualOverrideForm />
          </>
        )}
      </Box>
    </TabBase>
  )
}
