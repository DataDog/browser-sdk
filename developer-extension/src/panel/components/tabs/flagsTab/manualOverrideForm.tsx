import { Box, Button, Group, JsonInput, SegmentedControl, Space, Stack, Switch, Text, TextInput } from '@mantine/core'
import React, { useState } from 'react'
import { useFlagsContext } from './flagsContext'
import {
  FLAG_TYPES,
  FLAG_TYPE_CONFIG,
  flagTypeLabel,
  parseTypedString,
  validateOverrideValue,
  type FlagType,
} from './flagTypes'
import type { FlagOverride } from './inspectedPageFlags'

export function ManualOverrideForm() {
  const { catalog, applyOverride } = useFlagsContext()
  const [flagKey, setFlagKey] = useState('')
  const [type, setType] = useState<FlagType>('BOOLEAN')
  const [booleanValue, setBooleanValue] = useState(true)
  const [textValue, setTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const trimmedKey = flagKey.trim()
    if (!trimmedKey) {
      setError('Flag key is required')
      return
    }
    // If the key matches a flag on the loaded page, catch a type mismatch early — the provider would
    // otherwise silently reject it at resolve time. (A flag not on the current page is treated as
    // unknown here; the provider still rejects a true mismatch.)
    const catalogFlag = catalog.flags.find((flag) => flag.key === trimmedKey)
    if (catalogFlag && catalogFlag.type !== type) {
      setError(`"${trimmedKey}" is a ${flagTypeLabel(catalogFlag.type)} flag in the catalog — use that type instead`)
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
    applyOverride(trimmedKey, { type, value })
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

function parseFormValue(type: FlagType, raw: boolean | string): FlagOverride['value'] {
  // The Switch already hands us a real boolean, so BOOLEAN has no string to parse.
  if (type === 'BOOLEAN') {
    return Boolean(raw)
  }
  // The form is strict (unlike the catalog): a value that doesn't parse is a user error, so reject
  // it with the type's message rather than falling back to the raw string.
  const result = parseTypedString(type, String(raw))
  if (!result.ok) {
    throw new Error(FLAG_TYPE_CONFIG[type].parseErrorMessage)
  }
  return result.value as FlagOverride['value']
}
