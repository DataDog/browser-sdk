import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Space,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { IconArrowBackUp, IconCopy } from '@tabler/icons-react'
import React, { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { CatalogFlag } from './flagsRequests'
import { useFlagsContext } from './flagsContext'
import { validateOverrideValue } from './flagTypes'
import { getOverride, type FlagOverride } from './inspectedPageFlags'

export function FlagCatalogBody() {
  const { catalog, bottomFlags } = useFlagsContext()

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
        {catalog.total} {catalog.total === 1 ? 'flag' : 'flags'}
      </Text>
      <Space h="xs" />
      <FlagList
        flags={bottomFlags}
        borderColor="var(--mantine-color-gray-2)"
        // `bottomFlags` is the page minus overridden flags (those are pinned above). Only call it "no
        // match" when the server total is 0; otherwise this page's flags are all overridden.
        emptyMessage={
          catalog.total === 0 ? 'No flags match.' : 'All flags on this page are overridden — see Local overrides above.'
        }
      />
    </>
  )
}

/**
 * The always-visible "Local overrides" section shown above the paginated catalog. Lists every
 * overridden flag (regardless of which catalog page it's on), so overrides are never buried by
 * pagination. The overridden flags' catalog data comes from the context (see useOverriddenFlags).
 */
export function OverridesSection() {
  const { overriddenFlags } = useFlagsContext()

  if (overriddenFlags.length === 0) {
    return null
  }
  return (
    <>
      <Text fw={600} size="sm">
        Local overrides ({overriddenFlags.length})
      </Text>
      <Space h="xs" />
      <FlagList flags={overriddenFlags} borderColor="var(--mantine-color-violet-2)" />
    </>
  )
}

// Renders a bordered list of flag rows, or `emptyMessage` when there are none. Shared by the catalog
// body and the "Local overrides" section — they differ only in border color and empty copy. Reads
// the override state + actions from context so each row's wiring stays identical.
function FlagList({
  flags,
  borderColor,
  emptyMessage,
}: {
  flags: CatalogFlag[]
  borderColor: string
  emptyMessage?: ReactNode
}) {
  const { overrides, applyOverride, removeOverride } = useFlagsContext()
  return (
    <Box style={{ border: `1px solid ${borderColor}`, borderRadius: 'var(--mantine-radius-sm)' }}>
      {flags.length === 0 ? (
        <Text c="dimmed" p="md">
          {emptyMessage}
        </Text>
      ) : (
        flags.map((flag) => (
          <FlagRow
            key={flag.key}
            flag={flag}
            override={getOverride(overrides, flag.key)}
            onSelectVariant={applyOverride}
            onRevert={removeOverride}
          />
        ))
      )}
    </Box>
  )
}

function FlagRow({
  flag,
  override,
  onSelectVariant,
  onRevert,
}: {
  flag: CatalogFlag
  override: FlagOverride | undefined
  onSelectVariant: (flagKey: string, override: FlagOverride) => void
  onRevert: (flagKey: string) => void
}) {
  const overridden = override !== undefined

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      // Top-align so the variant buttons stay up beside the name/key instead of drifting to the
      // vertical middle of a long description.
      align="flex-start"
      px="sm"
      py="sm"
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-1)',
        backgroundColor: overridden ? 'var(--mantine-color-violet-0)' : undefined,
      }}
    >
      <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={600} truncate>
          {flag.name}
        </Text>
        <FlagKey value={flag.key} />
        {flag.description && <FlagDescription description={flag.description} />}
      </Stack>
      <Group gap="xs" wrap="wrap" justify="flex-end" style={{ flexShrink: 0, maxWidth: '55%' }}>
        {overridden && (
          <Tooltip label="Revert override">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onRevert(flag.key)}>
              <IconArrowBackUp size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        {flag.variants.length === 0 ? (
          <Text c="dimmed" size="xs">
            no variants
          </Text>
        ) : (
          flag.variants.map((variant) => {
            const isActive = overridden && valuesEqual(override.value, variant.value)
            // The catalog falls back to the raw string when a variant doesn't parse as its
            // declared type (see parseVariantValue) — writing that through would violate the
            // same contract validateOverrideValue enforces for manual overrides. `allowNull` keeps
            // a legitimate JSON `null` variant applyable (a raw-string type mismatch still fails).
            const validationError = validateOverrideValue(flag.type, variant.value, { allowNull: true })
            return (
              <Button
                key={variant.name}
                size="compact-xs"
                variant={isActive ? 'filled' : 'default'}
                color={isActive ? 'violet' : 'gray'}
                disabled={!!validationError}
                onClick={() =>
                  onSelectVariant(flag.key, { type: flag.type, value: variant.value as FlagOverride['value'] })
                }
                title={validationError ?? formatValue(variant.value)}
              >
                {variant.name}
              </Button>
            )
          })
        )}
      </Group>
    </Group>
  )
}

// Free-text descriptions can run long. Show a single line by default with a "Show more" toggle that
// expands the rest inline. The toggle only appears when the one-line clamp actually hides something —
// measured rather than guessed from length, since a short description can still wrap and a long one
// might fit.
function FlagDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  // Measured while collapsed (expanded isn't a dependency): once we know the text overflows one line,
  // the toggle stays available so "Show less" is still offered after expanding.
  useLayoutEffect(() => {
    const el = textRef.current
    if (el) {
      setOverflowing(el.scrollHeight > el.clientHeight)
    }
  }, [description])

  return (
    // Extra top margin gives the description a touch more separation from the key above it than the
    // name↔key gap, so the row reads as "title/key" then "description".
    <Box mt={4}>
      <Text ref={textRef} size="xs" c="dimmed" lineClamp={expanded ? undefined : 1}>
        {description}
      </Text>
      {(overflowing || expanded) && (
        // Accent color in both states so it reads as the row's action. A hair smaller than the
        // description text and sitting right beneath it, so the two read as clearly distinct.
        <Anchor
          component="button"
          type="button"
          fz={10}
          c="violet"
          onClick={() => setExpanded((value) => !value)}
          style={{ display: 'inline-block', marginTop: 0 }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Anchor>
      )}
    </Box>
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
          paddingInline: 6,
          // Pull the chip left by its own padding so the key TEXT lines up with the flag name above,
          // while the grey box keeps its inner breathing room.
          marginLeft: -6,
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

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
