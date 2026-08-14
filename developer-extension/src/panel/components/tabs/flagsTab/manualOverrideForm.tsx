import {
  Box,
  Button,
  Code,
  Group,
  JsonInput,
  SegmentedControl,
  Space,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import React, { useState } from 'react'
import { toErrorMessage } from '../../../../common/toErrorMessage'
import { useFlagsContext } from './flagsContext'
import {
  FLAG_TYPES,
  FLAG_TYPE_CONFIG,
  flagTypeLabel,
  parseTypedString,
  validateOverrideValue,
  type FlagType,
} from './flagTypes'
import { getOverride, type FlagOverride } from './inspectedPageFlags'

export function ManualOverrideForm() {
  const { catalog, overrides, applyOverride, mutationError } = useFlagsContext()
  const [flagKey, setFlagKey] = useState('')
  const [type, setType] = useState<FlagType>('BOOLEAN')
  const [booleanValue, setBooleanValue] = useState(true)
  const [textValue, setTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The last override submitted, used to report the outcome inline: the form sits below a long
  // catalog, so both the tab-level alert and the "Local overrides" section are easily offscreen from
  // here, and without this Apply looks like it did nothing.
  const [submitted, setSubmitted] = useState<{ key: string; value: FlagOverride['value'] } | null>(null)

  const trimmedKey = flagKey.trim()
  const existingOverride = getOverride(overrides, trimmedKey)
  // Derived from the stored overrides rather than the applyOverride call, so it reflects what the
  // page actually holds. A write failure leaves this false and surfaces mutationError instead.
  const applied = submitted !== null && valuesEqual(getOverride(overrides, submitted.key)?.value, submitted.value)

  /** Wraps a setter so any edit drops the previous outcome, rather than leaving it next to changed input. */
  function edit<T>(set: (value: T) => void) {
    return (value: T) => {
      setSubmitted(null)
      setError(null)
      set(value)
    }
  }

  function submit() {
    setError(null)
    setSubmitted(null)
    if (!trimmedKey) {
      setError('Flag key is required')
      return
    }
    // Catch a type mismatch early — the provider would otherwise silently reject it at resolve time.
    // A flag not on the current page is treated as unknown; the provider still rejects a true mismatch.
    const catalogFlag = catalog.flags.find((flag) => flag.key === trimmedKey)
    if (catalogFlag && catalogFlag.type !== type) {
      setError(`"${trimmedKey}" is a ${flagTypeLabel(catalogFlag.type)} flag in the catalog — use that type instead`)
      return
    }
    let value: FlagOverride['value']
    try {
      value = parseFormValue(type, type === 'BOOLEAN' ? booleanValue : textValue)
    } catch (err) {
      setError(toErrorMessage(err))
      return
    }
    const validationError = validateOverrideValue(type, value)
    if (validationError) {
      setError(validationError)
      return
    }
    applyOverride(trimmedKey, { type, value })
    setSubmitted({ key: trimmedKey, value })
    setError(null)
  }

  return (
    <Stack gap="sm" maw={420}>
      <TextInput
        label="Flag key"
        placeholder="my-flag"
        value={flagKey}
        onChange={(event) => edit(setFlagKey)(event.currentTarget.value)}
        size="xs"
        // Re-applying an existing key replaces its value rather than failing, so say so up front
        // instead of letting the change look like a no-op.
        description={existingOverride ? 'Already overridden — applying replaces the current value.' : undefined}
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
          onChange={(value) => edit(setType)(value)}
          data={FLAG_TYPES.map((flagType) => ({ value: flagType, label: flagType }))}
        />
      </Box>

      {type === 'BOOLEAN' ? (
        <Switch
          label={booleanValue ? 'true' : 'false'}
          checked={booleanValue}
          onChange={(event) => edit(setBooleanValue)(event.currentTarget.checked)}
          color="violet"
        />
      ) : type === 'JSON' ? (
        <JsonInput
          label="Value (JSON)"
          value={textValue}
          onChange={edit(setTextValue)}
          autosize
          minRows={2}
          size="xs"
        />
      ) : (
        <TextInput
          label="Value"
          placeholder={type === 'STRING' ? 'text' : 'number'}
          value={textValue}
          onChange={(event) => edit(setTextValue)(event.currentTarget.value)}
          size="xs"
        />
      )}

      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}

      {/* Gated on `submitted` so a failed write from elsewhere in the tab (a catalog row) doesn't
          light up this form — that one belongs to the tab-level alert. */}
      {submitted !== null &&
        (applied ? (
          <Text c="green" size="xs">
            Override set for <Code>{submitted.key}</Code> — refresh the page to apply it.
          </Text>
        ) : (
          mutationError && (
            <Text c="red" size="xs">
              {mutationError}
            </Text>
          )
        ))}

      <Group justify="flex-end">
        <Button size="xs" color="violet" onClick={submit}>
          Apply override
        </Button>
      </Group>
    </Stack>
  )
}

// Structural comparison: override values are JSON, so an OBJECT/JSON override needs more than ===.
function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Parses form input into an override value. Strict, unlike the catalog: input that doesn't parse is
 * a user error, so it throws rather than falling back to the raw string.
 */
function parseFormValue(type: FlagType, raw: boolean | string): FlagOverride['value'] {
  // The Switch already hands us a real boolean, so BOOLEAN has no string to parse.
  if (type === 'BOOLEAN') {
    return Boolean(raw)
  }
  const result = parseTypedString(type, String(raw))
  if (!result.ok) {
    throw new Error(FLAG_TYPE_CONFIG[type].parseErrorMessage)
  }
  return result.value as FlagOverride['value']
}
