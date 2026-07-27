import { ActionIcon, Badge, Box, Code, CopyButton, Group, Loader, Space, Text, Tooltip } from '@mantine/core'
import { IconCopy } from '@tabler/icons-react'
import React from 'react'
import type { CatalogFlag } from './flagCatalog'
import type { FlagCatalogState } from './useFlagCatalog'

export function FlagCatalogBody({
  catalog,
  flags,
  total,
}: {
  catalog: FlagCatalogState
  flags: CatalogFlag[]
  total: number
}) {
  if (catalog.loading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    )
  }

  if (catalog.error) {
    return <Text c="red">Failed to load catalog: {catalog.error}</Text>
  }

  return (
    <>
      <Text c="dimmed" size="xs">
        {total} {total === 1 ? 'flag' : 'flags'}
      </Text>
      <Space h="xs" />
      <Box style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 'var(--mantine-radius-sm)' }}>
        {flags.length === 0 ? (
          <Text c="dimmed" p="md">
            No flags match.
          </Text>
        ) : (
          flags.map((flag) => <FlagRow key={flag.key} flag={flag} />)
        )}
      </Box>
    </>
  )
}

function FlagRow({ flag }: { flag: CatalogFlag }) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      align="center"
      px="sm"
      py="xs"
      style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}
    >
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={600} truncate>
          {flag.name}
        </Text>
        <FlagKey value={flag.key} />
      </Box>
      <Group gap="xs" wrap="wrap" justify="flex-end" style={{ flexShrink: 0, maxWidth: '55%' }}>
        {flag.variants.length === 0 ? (
          <Text c="dimmed" size="xs">
            no variants
          </Text>
        ) : (
          flag.variants.map((variant) => (
            <Badge key={variant.name} variant="light" color="gray" title={formatValue(variant.value)}>
              {variant.name}
            </Badge>
          ))
        )}
      </Group>
    </Group>
  )
}

function FlagKey({ value }: { value: string }) {
  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <Code
        style={{
          flex: '0 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy key'} withArrow>
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={copy} style={{ flexShrink: 0 }}>
              <IconCopy size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  )
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
