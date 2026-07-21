import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Divider,
  Group,
  JsonInput,
  Loader,
  Pagination,
  PasswordInput,
  SegmentedControl,
  Select,
  Space,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { IconArrowBackUp, IconSearch } from '@tabler/icons-react'
import React, { useMemo, useState } from 'react'
import { TabBase } from '../../tabBase'
import { useSettings } from '../../../hooks/useSettings'
import type { FlagOverride, FlagOverrideType } from '../../../hooks/useFlagOverrides'
import { useFlagOverrides, validateOverrideValue } from '../../../hooks/useFlagOverrides'
import type { CatalogFlag } from './flagCatalog'
import { useFlagCatalog } from './useFlagCatalog'
import type { FlagAuthState } from './useFlagAuth'
import { useFlagAuth } from './useFlagAuth'

const FLAG_TYPES: FlagOverrideType[] = ['BOOLEAN', 'STRING', 'INTEGER', 'NUMERIC', 'JSON']
const CATALOG_PAGE_SIZE = 20
const ALL = 'all'

export function FlagsTab() {
  const auth = useFlagAuth()
  const { overrides, devtoolsEnabled, setOverride, clearOverride, clearAll, reloadPage } = useFlagOverrides()
  const catalog = useFlagCatalog(auth)

  const [pendingReload, setPendingReload] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [createdByFilter, setCreatedByFilter] = useState<string>(ALL)
  const [tagFilter, setTagFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)

  function applyOverride(flagKey: string, override: FlagOverride) {
    setPendingReload(true)
    void setOverride(flagKey, override)
  }

  function removeOverride(flagKey: string) {
    setPendingReload(true)
    void clearOverride(flagKey)
  }

  function removeAll() {
    setPendingReload(true)
    void clearAll()
  }

  function reload() {
    reloadPage()
    setPendingReload(false)
  }

  const filtered = useMemo(
    () =>
      catalog.flags.filter((flag) => {
        const haystack = `${flag.name} ${flag.key}`.toLowerCase()
        if (search && !haystack.includes(search.toLowerCase())) {
          return false
        }
        if (typeFilter !== ALL && flag.type !== typeFilter) {
          return false
        }
        if (createdByFilter !== ALL && flag.createdBy !== createdByFilter) {
          return false
        }
        if (tagFilter !== ALL && !flag.tags.includes(tagFilter)) {
          return false
        }
        return true
      }),
    [catalog.flags, search, typeFilter, createdByFilter, tagFilter]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * CATALOG_PAGE_SIZE, currentPage * CATALOG_PAGE_SIZE)
  const overrideCount = Object.keys(overrides).length

  // Gate the whole tab: nothing shows until the user connects (OAuth) or falls back to API keys.
  if (!auth.isConnected) {
    return (
      <TabBase>
        <ConnectScreen auth={auth} />
      </TabBase>
    )
  }

  return (
    <TabBase
      top={
        <Box px="md" className="dd-privacy-allow">
          <ConnectionHeader auth={auth} />
          <Space h="sm" />
          <FilterBar
            flags={catalog.flags}
            search={search}
            onSearch={(value) => {
              setSearch(value)
              setPage(1)
            }}
            typeFilter={typeFilter}
            onType={(value) => {
              setTypeFilter(value)
              setPage(1)
            }}
            createdByFilter={createdByFilter}
            onCreatedBy={(value) => {
              setCreatedByFilter(value)
              setPage(1)
            }}
            tagFilter={tagFilter}
            onTag={(value) => {
              setTagFilter(value)
              setPage(1)
            }}
          />
        </Box>
      }
    >
      <Box px="md" py="sm" className="dd-privacy-allow">
        {!devtoolsEnabled && (
          <>
            <Alert color="orange" title="DatadogDevtools not detected">
              The <Code>DatadogDevtools</Code> provider wrapper was not detected on this page. Overrides will only take
              effect once the page composes it. You can still set overrides — they'll apply when the wrapper is in
              place.
            </Alert>
            <Space h="sm" />
          </>
        )}

        <FlagCatalogBody
          catalog={catalog}
          flags={paginated}
          totalFiltered={filtered.length}
          totalFlags={catalog.flags.length}
          overrides={overrides}
          onSelectVariant={applyOverride}
          onRevert={removeOverride}
        />

        {totalPages > 1 && (
          <>
            <Space h="sm" />
            <Group justify="center">
              <Pagination size="xs" color="violet" total={totalPages} value={currentPage} onChange={setPage} />
            </Group>
          </>
        )}

        <Space h="md" />
        <Group justify="space-between">
          {overrideCount > 0 ? (
            <Button size="xs" variant="light" color="red" onClick={removeAll}>
              Clear all ({overrideCount})
            </Button>
          ) : (
            <span />
          )}
          <Button color="violet" onClick={reload} disabled={!pendingReload}>
            Save Overrides and Refresh Page
          </Button>
        </Group>

        <Space h="md" />
        <Anchor size="xs" c="dimmed" onClick={() => setAddOpen((open) => !open)}>
          {addOpen ? '− Hide custom override' : '+ Add a custom override'}
        </Anchor>
        {addOpen && (
          <>
            <Space h="sm" />
            <ManualOverrideForm onApply={applyOverride} />
          </>
        )}
      </Box>
    </TabBase>
  )
}

function FlagCatalogBody({
  catalog,
  flags,
  totalFiltered,
  totalFlags,
  overrides,
  onSelectVariant,
  onRevert,
}: {
  catalog: ReturnType<typeof useFlagCatalog>
  flags: CatalogFlag[]
  totalFiltered: number
  totalFlags: number
  overrides: Record<string, FlagOverride>
  onSelectVariant: (flagKey: string, override: FlagOverride) => void
  onRevert: (flagKey: string) => void
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
        {totalFiltered} of {totalFlags} flags
      </Text>
      <Space h="xs" />
      <Box style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 'var(--mantine-radius-sm)' }}>
        {flags.length === 0 ? (
          <Text c="dimmed" p="md">
            No flags match.
          </Text>
        ) : (
          flags.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              override={overrides[flag.key]}
              onSelectVariant={onSelectVariant}
              onRevert={onRevert}
            />
          ))
        )}
      </Box>
    </>
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
      align="center"
      px="sm"
      py="xs"
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-1)',
        backgroundColor: overridden ? 'var(--mantine-color-violet-0)' : undefined,
      }}
    >
      <Box style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>
          {flag.name}
        </Text>
        <Code>{flag.key}</Code>
      </Box>
      <Group gap="xs" wrap="wrap" justify="flex-end">
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
            return (
              <Button
                key={variant.name}
                size="compact-xs"
                variant={isActive ? 'filled' : 'default'}
                color={isActive ? 'violet' : 'gray'}
                onClick={() => onSelectVariant(flag.key, { type: flag.type, value: variant.value })}
                title={formatValue(variant.value)}
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

function FilterBar({
  flags,
  search,
  onSearch,
  typeFilter,
  onType,
  createdByFilter,
  onCreatedBy,
  tagFilter,
  onTag,
}: {
  flags: CatalogFlag[]
  search: string
  onSearch: (value: string) => void
  typeFilter: string
  onType: (value: string) => void
  createdByFilter: string
  onCreatedBy: (value: string) => void
  tagFilter: string
  onTag: (value: string) => void
}) {
  const typeOptions = useMemo(() => toOptions(flags.map((flag) => flag.type)), [flags])
  const createdByOptions = useMemo(
    () => toOptions(flags.map((flag) => flag.createdBy).filter((value): value is string => !!value)),
    [flags]
  )
  const tagOptions = useMemo(() => toOptions(flags.flatMap((flag) => flag.tags)), [flags])

  return (
    <Stack gap="xs">
      <TextInput
        placeholder="Filter your feature flags"
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(event) => onSearch(event.currentTarget.value)}
        size="xs"
      />
      <Group gap="xs" wrap="wrap">
        <Select
          label="Type"
          data={typeOptions}
          value={typeFilter}
          onChange={(value) => onType(value ?? ALL)}
          size="xs"
          w={140}
          allowDeselect={false}
        />
        <Select
          label="Created by"
          data={createdByOptions}
          value={createdByFilter}
          onChange={(value) => onCreatedBy(value ?? ALL)}
          size="xs"
          w={160}
          allowDeselect={false}
        />
        <Select
          label="Tags"
          data={tagOptions}
          value={tagFilter}
          onChange={(value) => onTag(value ?? ALL)}
          size="xs"
          w={160}
          allowDeselect={false}
        />
      </Group>
    </Stack>
  )
}

function ConnectScreen({ auth }: { auth: FlagAuthState }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <Center h="100%" className="dd-privacy-allow">
      <Stack align="center" gap="md" maw={460} px="md">
        <Text size="xl" fw={600} ta="center">
          Authenticate with Datadog to Override Feature Flags
        </Text>
        <Button color="violet" onClick={auth.connect} loading={auth.connecting}>
          Sign in to Datadog
        </Button>
        {auth.error && (
          <Text c="red" size="xs" ta="center">
            {auth.error}
          </Text>
        )}

        <Anchor size="xs" c="dimmed" onClick={() => setAdvancedOpen((open) => !open)}>
          {advancedOpen ? '− Hide advanced' : 'Advanced: site & API keys (fallback)'}
        </Anchor>
        {advancedOpen && (
          <Stack gap="sm" style={{ width: '100%' }}>
            <SiteField />
            <Divider label="or use API keys (fallback)" labelPosition="center" />
            <ApiKeysForm />
          </Stack>
        )}
      </Stack>
    </Center>
  )
}

function ConnectionHeader({ auth }: { auth: FlagAuthState }) {
  return (
    <Group justify="space-between">
      <Group gap="xs">
        <Badge color={auth.oauthConnected ? 'green' : 'gray'} variant="light">
          {auth.oauthConnected ? 'Connected via OAuth' : 'Using API keys'}
        </Badge>
        <Text c="dimmed" size="xs">
          {auth.site}
        </Text>
      </Group>
      {auth.oauthConnected && (
        <Button size="compact-xs" variant="subtle" color="gray" onClick={auth.disconnect}>
          Disconnect
        </Button>
      )}
    </Group>
  )
}

function SiteField() {
  const [{ flagsSite }, setSetting] = useSettings()

  return (
    <TextInput
      label="Datadog site"
      placeholder="datadoghq.com"
      description="Use datad0g.com for staging."
      value={flagsSite}
      onChange={(event) => setSetting('flagsSite', event.currentTarget.value)}
      size="xs"
    />
  )
}

function ApiKeysForm() {
  const [{ flagsApiKey, flagsAppKey }, setSetting] = useSettings()

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="xs">
        Fallback — stored in the extension only, used to fetch the flag catalog if you don't connect via OAuth.
      </Text>
      <PasswordInput
        label="API key"
        value={flagsApiKey}
        onChange={(event) => setSetting('flagsApiKey', event.currentTarget.value)}
        size="xs"
      />
      <PasswordInput
        label="Application key"
        value={flagsAppKey}
        onChange={(event) => setSetting('flagsAppKey', event.currentTarget.value)}
        size="xs"
      />
    </Stack>
  )
}

function ManualOverrideForm({ onApply }: { onApply: (flagKey: string, override: FlagOverride) => void }) {
  const [flagKey, setFlagKey] = useState('')
  const [type, setType] = useState<FlagOverrideType>('BOOLEAN')
  const [booleanValue, setBooleanValue] = useState(true)
  const [textValue, setTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    if (!flagKey.trim()) {
      setError('Flag key is required')
      return
    }
    let value: FlagOverride['value']
    try {
      value = parseFormValue(type, type === 'BOOLEAN' ? booleanValue : textValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    const validationError = validateOverrideValue(type, value)
    if (validationError) {
      setError(validationError)
      return
    }
    onApply(flagKey.trim(), { type, value })
    setError(null)
  }

  return (
    <Stack gap="sm" maw={420}>
      <TextInput
        label="Flag key"
        placeholder="my-flag"
        value={flagKey}
        onChange={(event) => setFlagKey(event.currentTarget.value)}
        size="xs"
      />
      <Box>
        <Text size="xs" fw={500}>
          Type
        </Text>
        <Space h={4} />
        <SegmentedControl
          color="violet"
          size="xs"
          value={type}
          onChange={(value) => setType(value)}
          data={FLAG_TYPES.map((flagType) => ({ value: flagType, label: flagType }))}
        />
      </Box>

      {type === 'BOOLEAN' ? (
        <Switch
          label={booleanValue ? 'true' : 'false'}
          checked={booleanValue}
          onChange={(event) => setBooleanValue(event.currentTarget.checked)}
          color="violet"
        />
      ) : type === 'JSON' ? (
        <JsonInput label="Value (JSON)" value={textValue} onChange={setTextValue} autosize minRows={2} size="xs" />
      ) : (
        <TextInput
          label="Value"
          placeholder={type === 'STRING' ? 'text' : 'number'}
          value={textValue}
          onChange={(event) => setTextValue(event.currentTarget.value)}
          size="xs"
        />
      )}

      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}

      <Group justify="flex-end">
        <Button size="xs" color="violet" onClick={submit}>
          Apply override
        </Button>
      </Group>
    </Stack>
  )
}

function toOptions(values: string[]): Array<{ value: string; label: string }> {
  const unique = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  return [{ value: ALL, label: 'All' }, ...unique.map((value) => ({ value, label: value }))]
}

function parseFormValue(type: FlagOverrideType, raw: boolean | string): FlagOverride['value'] {
  switch (type) {
    case 'BOOLEAN':
      return Boolean(raw)
    case 'STRING':
      return String(raw)
    case 'INTEGER':
    case 'NUMERIC': {
      const text = String(raw).trim()
      if (text === '' || Number.isNaN(Number(text))) {
        throw new Error('Enter a valid number')
      }
      return Number(text)
    }
    case 'JSON':
      try {
        return JSON.parse(String(raw)) as object
      } catch {
        throw new Error('Enter valid JSON')
      }
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
