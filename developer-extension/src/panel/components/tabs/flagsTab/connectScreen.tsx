import { Alert, Badge, Box, Button, Center, Group, Select, Stack, Text } from '@mantine/core'
import React from 'react'
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
 * Surfaces overrides already stored on the inspected page while signed out — otherwise this screen is
 * all that renders, so an override left from an earlier session keeps affecting the page with nothing
 * to explain it. Informational only; everything that mutates overrides lives on the connected tab.
 *
 * Mounted only while disconnected, so its navigation listeners never run alongside the connected
 * tab's own instance of this hook.
 */
function DisconnectedOverridesNotice() {
  const { status, overrides } = useInspectedPageOverrides()
  const count = Object.keys(overrides).length

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
        These are stored in the page and keep applying while you are signed out. Sign in to view and remove them.
      </Text>
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
