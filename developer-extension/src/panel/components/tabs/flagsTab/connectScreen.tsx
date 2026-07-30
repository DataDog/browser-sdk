import { Badge, Box, Button, Center, Group, Select, Stack, Text } from '@mantine/core'
import React from 'react'
import { useSettings } from '../../../hooks/useSettings'
import type { FlagAuthState } from './useFlagAuth'
import { FLAG_SITES } from './oauth'

export function ConnectScreen({ auth }: { auth: FlagAuthState }) {
  return (
    <Center h="100%" className="dd-privacy-allow">
      <Stack align="center" gap="md" maw={460} px="md">
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

export function ConnectionHeader({ auth }: { auth: FlagAuthState }) {
  return (
    <Stack gap={4}>
      {/* One read-only status badge — "CONNECTED: <site>" — states which site you're connected to
          without a separate input-looking field (the auth method is an implementation detail the user
          doesn't need). Disconnect is a red button so it reads as the destructive sign-out. */}
      <Group gap="xs" align="center">
        <Badge color="green" variant="light">
          Connected: {auth.site}
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
