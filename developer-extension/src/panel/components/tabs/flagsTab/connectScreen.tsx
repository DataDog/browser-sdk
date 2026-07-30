import { Anchor, Badge, Button, Center, Group, Select, Stack, Text } from '@mantine/core'
import React, { useState } from 'react'
import { useSettings } from '../../../hooks/useSettings'
import type { FlagAuthState } from './useFlagAuth'
import { FLAG_SITES } from './oauth'

export function ConnectScreen({ auth }: { auth: FlagAuthState }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <Center h="100%" className="dd-privacy-allow">
      <Stack align="center" gap="md" maw={460} px="md">
        <Text size="xl" fw={600} ta="center">
          Authenticate with Datadog to access your feature flags
        </Text>
        <Button color="violet" onClick={auth.connect} loading={auth.connecting}>
          Sign in to Datadog
        </Button>
        {auth.error && (
          <Text c="red" size="xs" ta="center">
            {auth.error}
          </Text>
        )}

        <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => setAdvancedOpen((open) => !open)}>
          {advancedOpen ? '− Hide advanced' : 'Advanced: site'}
        </Anchor>
        {advancedOpen && (
          <Stack gap="sm" style={{ width: '100%' }}>
            <SiteField />
          </Stack>
        )}
      </Stack>
    </Center>
  )
}

export function ConnectionHeader({ auth }: { auth: FlagAuthState }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Group gap="xs">
          <Badge color="green" variant="light">
            Connected via OAuth
          </Badge>
          <Text c="dimmed" size="xs">
            {auth.site}
          </Text>
        </Group>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={auth.disconnect}>
          Disconnect
        </Button>
      </Group>
      {/* Surface disconnect failures here too — otherwise a failed Disconnect looks like a no-op. */}
      {auth.error && (
        <Text c="red" size="xs" ta="right">
          {auth.error}
        </Text>
      )}
    </Stack>
  )
}

function SiteField() {
  const [{ flagsSite }, setSetting] = useSettings()

  return (
    <Select
      label="Datadog site"
      description="Your organization's Datadog site."
      data={FLAG_SITES.map(({ site, label }) => ({ value: site, label }))}
      value={flagsSite}
      onChange={(value) => value && setSetting('flagsSite', value)}
      allowDeselect={false}
      size="xs"
    />
  )
}
