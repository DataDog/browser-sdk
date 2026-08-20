import { Alert, Anchor, Box, Button, Code, Group, Pagination, Space, Text, Title } from '@mantine/core'
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

  // Remount on site change so nothing carries over from a previously-connected org — stale filters
  // would misleadingly empty the new catalog, and stale suggestions would leak the old org's tags.
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
    siteSwitchNeedsReload,
    scopeError,
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
        // No dd-privacy-allow: this renders customer flag names, values, and tags, which must stay
        // masked in the extension's own Session Replay.
        <Box>
          <Title order={5}>Feature Flag Overrides</Title>
          <Space h="xs" />
          <ConnectionHeader auth={auth} />
          <Space h="sm" />
          <FlagFilterBar />
        </Box>
      }
    >
      <Box px="md" py="sm">
        {/* Louder than the usual refresh nudge: the page is applying a different set than the one
            listed below. */}
        {siteSwitchNeedsReload && (
          <>
            <Alert color="orange" title="Reload to apply this site's overrides">
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">
                  Which overrides apply changed when you switched sites, and the page hasn&apos;t reloaded since.
                </Text>
                <Button
                  size="compact-xs"
                  color="orange"
                  onClick={reload}
                  // Same guard as Refresh Page: reloading mid-write boots the wrapper without it.
                  disabled={overrideStatus !== 'ready' || writesInFlight > 0}
                >
                  Reload page
                </Button>
              </Group>
            </Alert>
            <Space h="sm" />
          </>
        )}

        {scopeError && (
          <>
            <Alert color="red" title="Couldn't scope overrides to this site">
              {scopeError}
            </Alert>
            <Space h="sm" />
          </>
        )}

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

      {/* Sticky so the apply/refresh actions stay visible without scrolling past a long catalog. */}
      <Box
        px="md"
        py="sm"
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          backgroundColor: 'var(--mantine-color-body)',
          borderTop: '1px solid var(--mantine-color-default-border)',
          boxShadow: '0 -4px 8px -6px rgba(0, 0, 0, 0.25)',
        }}
      >
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
            // Overrides are already written; this only reloads to apply them. Never while a write is
            // in flight, which would reload with stale state.
            disabled={overrideStatus !== 'ready' || writesInFlight > 0 || (overrideCount === 0 && !pendingReload)}
          >
            Refresh Page
          </Button>
        </Group>
      </Box>
    </TabBase>
  )
}
