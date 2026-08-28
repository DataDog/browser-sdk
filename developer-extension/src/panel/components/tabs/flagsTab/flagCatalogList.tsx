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
import { flagTypeLabel, validateOverrideValue } from './flagTypes'
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
        borderColor="var(--mantine-color-default-border)"
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
 * Pinned above the paginated catalog, listing every overridden flag regardless of which page it's
 * on, so overrides are never buried by pagination.
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
      <FlagList flags={overriddenFlags} borderColor="var(--mantine-color-violet-outline)" />
    </>
  )
}

/**
 * A bordered list of flag rows, shared by the catalog body and the "Local overrides" section — they
 * differ only in border color and empty copy.
 */
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
  // The wrapper rejects a mismatched type, so this override won't apply.
  const typeMismatch = overridden && override.type !== flag.type

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      // Keeps the variant buttons beside the name/key rather than centred on a long description.
      align="flex-start"
      px="sm"
      py="sm"
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backgroundColor: typeMismatch
          ? 'var(--mantine-color-red-light)'
          : overridden
            ? 'var(--mantine-color-violet-light)'
            : undefined,
      }}
    >
      <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={600} truncate>
          {flag.name}
        </Text>
        <FlagKey value={flag.key} />
        {flag.description && <FlagDescription description={flag.description} />}
        {override && typeMismatch && (
          <Text size="xs" c="red" fw={600}>
            Type mismatch: stored as {flagTypeLabel(override.type)}, but this flag is {flagTypeLabel(flag.type)}. It
            won&apos;t apply until you clear it.
          </Text>
        )}
        {/* Not an error: the override still works, the flag just left the catalog. */}
        {flag.unresolved && (
          <Text size="xs" c="dimmed">
            No active flag with this key on this site — it may have been archived or deleted.
          </Text>
        )}
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
            const isActive = overridden && !typeMismatch && valuesEqual(override.value, variant.value)
            // The catalog keeps an unparseable variant as its raw string (see parseVariantValue), and
            // writing that through would break the override type contract. `allowNull` keeps a
            // legitimate JSON `null` variant applyable.
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

/**
 * Clamps a long description to one line behind a "Show more" toggle. The toggle appears only when
 * the clamp actually hides something — measured rather than guessed from length, since a short
 * description can still wrap and a long one might fit.
 */
function FlagDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  // Skipped while expanded: the clamp is off then, so a measurement would read as "fits" and wrongly
  // hide the toggle. The ResizeObserver re-measures when the panel width changes.
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || expanded) {
      return
    }
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [description, expanded])

  return (
    <Box mt={4}>
      <Text ref={textRef} size="xs" lineClamp={expanded ? undefined : 1}>
        {description}
      </Text>
      {overflowing && (
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
          // Negates the chip's own padding so the key lines up with the flag name above.
          paddingInline: 6,
          marginLeft: -6,
        }}
      >
        {value}
      </Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy key'} withArrow>
            <ActionIcon
              size="xs"
              variant="subtle"
              color={copied ? 'violet' : 'gray'}
              onClick={copy}
              style={{ flexShrink: 0 }}
            >
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
