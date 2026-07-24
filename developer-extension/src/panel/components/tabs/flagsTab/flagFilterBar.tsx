import { Group, MultiSelect, Stack, TagsInput, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import React from 'react'
import { FLAG_TYPES, FLAG_TYPE_CONFIG } from './flagTypes'
import { useFlagsContext } from './flagsContext'

// Type is a fixed set, so its options are static. There's no tags endpoint and we only load a page
// at a time, so the Tag filter can't show every tag — instead it offers `tagSuggestions` (tags seen
// on pages loaded so far) as autocomplete while still accepting any typed tag. Search/type/tags are
// all applied server-side (see useFlagCatalog).
export function FlagFilterBar() {
  const { view, tagSuggestions } = useFlagsContext()
  const typeOptions = FLAG_TYPES.map((type) => ({ value: type, label: FLAG_TYPE_CONFIG[type].label }))

  return (
    <Stack gap="xs">
      <TextInput
        placeholder="Filter your feature flags"
        leftSection={<IconSearch size={14} />}
        value={view.search}
        onChange={(event) => view.setSearch(event.currentTarget.value)}
        size="xs"
      />
      <Group gap="xs" wrap="wrap" align="flex-end">
        <MultiSelect
          label="Type"
          placeholder={view.typeFilter.length === 0 ? 'All' : undefined}
          data={typeOptions}
          value={view.typeFilter}
          onChange={view.setTypeFilter}
          size="xs"
          w={220}
          clearable
        />
        <TagsInput
          label="Tags"
          placeholder={view.tagFilter.length === 0 ? 'Type or pick a tag…' : undefined}
          data={tagSuggestions}
          value={view.tagFilter}
          onChange={view.setTagFilter}
          size="xs"
          w={280}
          clearable
        />
      </Group>
    </Stack>
  )
}
