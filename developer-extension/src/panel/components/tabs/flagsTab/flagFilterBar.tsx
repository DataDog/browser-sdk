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

// Type is a fixed set, so its options are static. There's no tags endpoint and we only load a page
// at a time, so the Tag filter can't show every tag — instead it offers `tagSuggestions` (tags seen
// on pages loaded so far) as autocomplete while still accepting any typed tag. Search, type, tags,
// "My feature flags" (created_by) and "My teams" (team: tags) are all applied server-side.
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
      {/* Bottom-aligned so the toggle sits on the same baseline as the labelled selects; the selects
          flex-grow and wrap so the row stays tidy in the narrow devtools panel. */}
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
  // Without the signed-in user's UUID there's nothing to compare a flag's creator against, so the
  // filter could only ever match nothing. Disable it and say why, rather than offering a toggle whose
  // only effect is to empty the list.
  const unavailable = !identity.loading && !identity.userId

  return (
    <Tooltip label="Unavailable: could not determine the signed-in user" disabled={!unavailable} withArrow>
      {/* Bordered rounded rectangle so the toggle reads as a filter chip matching the Type/Tags boxes.
          The Box also lets the tooltip fire while the Switch itself is disabled. */}
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid var(--mantine-color-gray-4)',
          borderRadius: 'var(--mantine-radius-md)',
          padding: '6px 12px',
        }}
      >
        <Switch
          label="My Feature Flags"
          labelPosition="left"
          color="violet"
          size="xs"
          // Keep the rendered state honest: while identity is loading or unavailable the filter isn't
          // applied (see useFlagCatalogView), so it must not read as on.
          checked={view.myFlagsOnly && !!identity.userId}
          disabled={identity.loading || unavailable}
          onChange={(event) => view.setMyFlagsOnly(event.currentTarget.checked)}
        />
      </Box>
    </Tooltip>
  )
}

// A checkbox dropdown rather than a chip multiselect: the closed control shows a compact "N teams
// selected" summary (so it never grows tall), and the open list checks the selected teams and floats
// them to the top.
function MyTeamsSelect({ view, identity }: { view: FlagCatalogView; identity: FlagIdentityState }) {
  const selected = view.teamFilter
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })

  // Snapshot a "selected first" ordering when the dropdown opens, so toggling a team mid-list doesn't
  // make it jump under the cursor. Recomputed on each open.
  const [ordered, setOrdered] = useState<string[]>([])

  // Disabled while there's nothing to pick: still loading, no teams, or the token can't read teams.
  const disabled = identity.teamHandles.length === 0

  // Explain a disabled control — the token can't read teams, or the user is in none. Stay silent
  // while still loading, or when there are teams to pick.
  const tooltipLabel = identity.teamsForbidden
    ? 'Reconnect to grant the teams_read scope this filter needs'
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

  // Fall back to the raw handles until the first open populates `ordered`.
  const list = ordered.length > 0 ? ordered : identity.teamHandles
  const options = list.map((handle) => (
    <Combobox.Option value={handle} key={handle} active={selected.includes(handle)}>
      <Group gap="xs" wrap="nowrap">
        <Checkbox checked={selected.includes(handle)} readOnly tabIndex={-1} size="xs" aria-hidden />
        <span>{handle}</span>
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
            <Combobox.Options mah={220} style={{ overflowY: 'auto' }}>
              {options}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Box>
    </Tooltip>
  )
}
