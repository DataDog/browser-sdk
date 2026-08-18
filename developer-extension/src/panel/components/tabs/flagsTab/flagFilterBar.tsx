import {
  Box,
  Checkbox,
  Combobox,
  Group,
  InputBase,
  MultiSelect,
  Stack,
  Switch,
  TagsInput,
  TextInput,
  Tooltip,
  useCombobox,
} from '@mantine/core'
import { IconChevronRight, IconSearch } from '@tabler/icons-react'
import React, { useState } from 'react'
import { FLAG_TYPES, FLAG_TYPE_CONFIG } from './flagTypes'
import { useFlagsContext } from './flagsContext'
import type { FlagIdentityState } from './useFlagIdentity'
import type { FlagCatalogView } from './useFlagCatalogView'

/**
 * Every filter here is applied server-side. Tags are the exception to the "options are known" rule:
 * there's no tags endpoint and we load a page at a time, so `tagSuggestions` only autocompletes tags
 * seen so far while still accepting any typed tag.
 */
export function FlagFilterBar() {
  const { view, tagSuggestions, identity } = useFlagsContext()
  const typeOptions = FLAG_TYPES.map((type) => ({ value: type, label: FLAG_TYPE_CONFIG[type].label }))

  return (
    <Stack gap="sm">
      <TextInput
        placeholder="Filter your feature flags"
        leftSection={<IconSearch size={14} />}
        value={view.search}
        onChange={(event) => view.setSearch(event.currentTarget.value)}
        size="xs"
      />
      {/* Bottom-aligned so the toggle shares a baseline with the labelled selects. */}
      <Group gap="sm" align="flex-end" wrap="wrap">
        <MyFlagsSwitch view={view} identity={identity} />
        <MyTeamsSelect view={view} identity={identity} />
        <MultiSelect
          label="Type"
          placeholder={view.typeFilter.length === 0 ? 'All' : undefined}
          data={typeOptions}
          value={view.typeFilter}
          onChange={view.setTypeFilter}
          size="xs"
          w={140}
          clearable
        />
        <TagsInput
          label="Tags"
          placeholder={view.tagFilter.length === 0 ? 'Type or pick a tag…' : undefined}
          data={tagSuggestions}
          value={view.tagFilter}
          onChange={view.setTagFilter}
          size="xs"
          w={140}
          clearable
        />
      </Group>
    </Stack>
  )
}

function MyFlagsSwitch({ view, identity }: { view: FlagCatalogView; identity: FlagIdentityState }) {
  // Without a user id the created_by filter can only ever empty the list, so disable it.
  const unavailable = !identity.loading && !identity.userId

  return (
    <Tooltip label="Unavailable: could not determine the signed-in user" disabled={!unavailable} withArrow>
      {/* Reads as a filter chip matching the Type/Tags boxes, and lets the tooltip fire while the
          Switch itself is disabled. */}
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-md)',
          padding: '6px 12px',
        }}
      >
        <Switch
          label="My Feature Flags"
          labelPosition="left"
          color="violet"
          size="xs"
          // Without a user id the filter isn't actually applied, so it must not read as on.
          checked={view.myFlagsOnly && !!identity.userId}
          disabled={identity.loading || unavailable}
          onChange={(event) => view.setMyFlagsOnly(event.currentTarget.checked)}
        />
      </Box>
    </Tooltip>
  )
}

// Matches the web UI's team filter: its default page of 10, plus a small buffer.
const TEAM_SEARCH_THRESHOLD = 12

/**
 * A checkbox dropdown rather than a chip multiselect, so the closed control stays a compact "N teams
 * selected" summary instead of growing tall in the narrow panel.
 */
function MyTeamsSelect({ view, identity }: { view: FlagCatalogView; identity: FlagIdentityState }) {
  const selected = view.teamFilter
  const [search, setSearch] = useState('')
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setSearch('')
    },
  })

  // Snapshot a "selected first" ordering on open, so toggling a team doesn't make it jump under the
  // cursor. Recomputed on each open.
  const [ordered, setOrdered] = useState<string[]>([])

  const disabled = identity.teamHandles.length === 0

  // Explains a disabled control, but stays silent while loading or when there are teams to pick.
  const tooltipLabel = identity.teamsForbidden
    ? "You don't have permission to view teams"
    : identity.teamsUnavailable
      ? "Couldn't load your teams — try reconnecting"
      : !identity.loading && identity.teamHandles.length === 0
        ? "You're not in any teams"
        : null

  const toggle = (handle: string) =>
    view.setTeamFilter(selected.includes(handle) ? selected.filter((h) => h !== handle) : [...selected, handle])

  const openWithOrder = () => {
    if (!combobox.dropdownOpened) {
      const inSelection = identity.teamHandles.filter((handle) => selected.includes(handle))
      const rest = identity.teamHandles.filter((handle) => !selected.includes(handle))
      setOrdered([...inSelection, ...rest])
    }
    combobox.toggleDropdown()
  }

  const list = ordered.length > 0 ? ordered : identity.teamHandles
  const searchable = identity.teamHandles.length > TEAM_SEARCH_THRESHOLD
  const query = search.trim().toLowerCase()
  const options = list
    // Selected teams survive the search filter, so a selection never disappears under the user.
    .filter((handle) => selected.includes(handle) || !query || handle.toLowerCase().includes(query))
    .map((handle) => (
      <Combobox.Option value={handle} key={handle} active={selected.includes(handle)}>
        {/* Wrap long handles instead of overflowing the narrow dropdown. */}
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Checkbox
            checked={selected.includes(handle)}
            readOnly
            tabIndex={-1}
            size="xs"
            aria-hidden
            style={{ flexShrink: 0 }}
          />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{handle}</span>
        </Group>
      </Combobox.Option>
    ))

  return (
    <Tooltip label={tooltipLabel ?? ''} disabled={!tooltipLabel} withArrow>
      <Box w={150}>
        <Combobox store={combobox} size="xs" onOptionSubmit={toggle}>
          <Combobox.Target>
            <InputBase
              component="button"
              type="button"
              size="xs"
              pointer
              disabled={disabled}
              leftSection={<IconChevronRight size={14} />}
              rightSection={<Combobox.Chevron />}
              rightSectionPointerEvents="none"
              onClick={openWithOrder}
            >
              {selected.length > 0 ? `My Teams · ${selected.length}` : 'My Teams'}
            </InputBase>
          </Combobox.Target>
          <Combobox.Dropdown>
            {searchable && (
              <Combobox.Search
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search teams"
              />
            )}
            <Combobox.Options mah={220} style={{ overflowY: 'auto' }}>
              {options.length > 0 ? options : <Combobox.Empty>No teams match</Combobox.Empty>}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Box>
    </Tooltip>
  )
}
