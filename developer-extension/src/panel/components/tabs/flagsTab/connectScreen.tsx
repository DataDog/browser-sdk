import { Alert, Badge, Box, Button, Center, Group, Select, Stack, Text } from '@mantine/core'
import React, { useEffect, useRef, useState } from 'react'
import { toErrorMessage } from '../../../../common/toErrorMessage'
import { useSettings } from '../../../hooks/useSettings'
import type { FlagAuthState } from './useFlagAuth'
import { useInspectedPageOverrides } from './useInspectedPageOverrides'
import { FLAG_SITES } from './oauth'

export function ConnectScreen({ auth }: { auth: FlagAuthState }) {
  return (
    <Center h="100%" className="dd-privacy-allow">
      <Stack align="center" gap="md" maw={460} px="md">
        <DisconnectedOverridesNotice />
        <Text size="xl" fw={600} ta="center">
          Authenticate with Datadog to access your feature flags
        </Text>
        {/* Pick the site before signing in: it selects which Datadog OAuth server + FFE API the flow
            talks to (see FLAG_SITES), so it must be set before the Sign in button runs that flow. */}
        <Box w="100%">
          {/* Locked while signing in: the chosen site is baked into the OAuth flow already running, so
              switching mid-flow would point the resulting token at a different environment. */}
          <SiteField disabled={auth.connecting} />
        </Box>
        <Button color="violet" onClick={auth.connect} loading={auth.connecting}>
          Sign in to Datadog
        </Button>
        {auth.error && (
          <Text c="red" size="xs" ta="center">
            {auth.error}
          </Text>
        )}
        {/* A revocation that failed leaves the grant live at Datadog while this panel is signed out,
            so the notice belongs on this screen — it's the one the user lands on after disconnecting. */}
        {auth.warning && (
          <Text c="orange" size="xs" ta="center">
            {auth.warning} You can revoke it from Datadog under Organization Settings → Authorized Applications.
          </Text>
        )}
      </Stack>
    </Center>
  )
}

/**
 * Surfaces overrides already stored on the inspected page while signed out, with a Clear all so they
 * can be wiped without signing in.
 *
 * Mounted only while disconnected, so its navigation listeners never run alongside the connected
 * tab's own instance of this hook.
 */
function DisconnectedOverridesNotice() {
  const { status, overrides, clearAll, reloadPage } = useInspectedPageOverrides()
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'clearing' | 'cleared'>('idle')
  const [error, setError] = useState<string | null>(null)
  // Bumped on navigation so a clear that settles afterwards can't report on the page it left.
  const generation = useRef(0)
  const count = Object.keys(overrides).length

  // A navigation brings a fresh set of overrides: a pending confirmation would clear those instead,
  // and a previous "cleared" no longer describes the page.
  useEffect(() => {
    if (status === 'loading') {
      generation.current += 1
      setPhase('idle')
      setError(null)
    }
  }, [status])

  const handleClearAll = () => {
    const started = generation.current
    setPhase('clearing')
    setError(null)
    void clearAll()
      .then(() => {
        if (started === generation.current) {
          setPhase('cleared')
        }
      })
      .catch((err: unknown) => {
        if (started === generation.current) {
          setError(toErrorMessage(err))
          setPhase('idle')
        }
      })
  }

  // Gated on the page agreeing it has none: a same-document SPA navigation fires no webNavigation
  // event, so without this the banner could outlive the state it describes.
  if (phase === 'cleared' && status === 'ready' && count === 0) {
    // The page keeps applying them until it reloads and rebuilds its provider.
    return (
      <Alert color="green" w="100%" title="Overrides cleared">
        <Group gap="xs">
          <Text size="xs">Please reload the page to stop applying them.</Text>
          <Button size="compact-xs" variant="light" color="green" onClick={reloadPage}>
            Reload page
          </Button>
        </Group>
      </Alert>
    )
  }

  if (status !== 'ready' || count === 0) {
    return null
  }

  return (
    // Masked despite the surrounding dd-privacy-allow: only a count renders today, but flag keys are
    // customer data, so anything added here should stay out of the extension's own Session Replay.
    <Alert
      color="orange"
      w="100%"
      data-dd-privacy="mask"
      title={`${count} override${count === 1 ? '' : 's'} active on this page`}
    >
      <Text size="xs">
        These are stored in the page and keep applying while you are signed out. Sign in to review and remove them
        individually.
      </Text>
      <Group gap="xs" mt="xs">
        {phase === 'confirming' || phase === 'clearing' ? (
          <>
            <Text size="xs" fw={600}>
              Clear all overrides on this page, including any saved for other Datadog sites?
            </Text>
            <Button size="compact-xs" color="red" onClick={handleClearAll} loading={phase === 'clearing'}>
              Clear
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setPhase('idle')}
              disabled={phase === 'clearing'}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button size="compact-xs" variant="light" color="red" onClick={() => setPhase('confirming')}>
            Clear all
          </Button>
        )}
      </Group>
      {error && (
        <Text c="red" size="xs" mt="xs">
          Could not clear the overrides: {error}
        </Text>
      )}
    </Alert>
  )
}

export function ConnectionHeader({ auth }: { auth: FlagAuthState }) {
  return (
    <Stack gap={4}>
      {/* The badge opts out of Mantine's default uppercasing: "datad0g.com" and "datadoghq.com"
          differ by a zero vs an "o", so caps destroy the one glyph telling staging from production.
          Disconnect sits at the far end — it revokes the grant, so a misclick costs a full re-auth. */}
      <Group gap="xs" align="center" justify="space-between" wrap="nowrap">
        <Badge color="green" variant="light" tt="none">
          Connected: {siteLabel(auth.site)}
        </Badge>
        <Button
          size="compact-xs"
          variant="light"
          color="red"
          onClick={auth.disconnect}
          loading={auth.disconnecting}
          // Disconnect revokes the grant at Datadog before clearing the local session, so guard
          // against a second click re-running it against tokens the first click already revoked.
          disabled={auth.disconnecting}
        >
          Disconnect
        </Button>
      </Group>
      {/* Surface disconnect failures here too — otherwise a failed Disconnect looks like a no-op.
          (A revoke-succeeded-but-grant-live warning can't appear here: it always accompanies a
          successful local sign-out, which flips to the ConnectScreen where the notice lives.) */}
      {auth.error && (
        <Text c="red" size="xs">
          {auth.error}
        </Text>
      )}
    </Stack>
  )
}

// Falls back to the raw site so a stale or hand-edited setting still renders something meaningful
// (getFlagsApiHost is the one that treats an unknown site as an error).
function siteLabel(site: string): string {
  return FLAG_SITES.find((entry) => entry.site === site)?.label ?? site
}

function SiteField({ disabled }: { disabled?: boolean }) {
  const [{ flagsSite }, setSetting] = useSettings()

  return (
    <Select
      label="Datadog site"
      description="Your organization's Datadog site."
      data={FLAG_SITES.map(({ site, label }) => ({ value: site, label }))}
      value={flagsSite}
      onChange={(value) => value && setSetting('flagsSite', value)}
      allowDeselect={false}
      disabled={disabled}
      size="xs"
    />
  )
}
