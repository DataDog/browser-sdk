// Shared flag and override types plus the per-type value logic (labels, parsing, validation) they
// drive. One home for everything that is specific to a flag's value type, imported by both the
// request/catalog layer and the inspected-page override layer.

// Feature-flag value types, in display order (drives the catalog's Type filter).
export const FLAG_TYPES = ['BOOLEAN', 'STRING', 'INTEGER', 'NUMERIC', 'JSON'] as const

// The value type of a feature flag (and of an override for it), derived from FLAG_TYPES so the list
// stays the single source of truth.
export type FlagType = (typeof FLAG_TYPES)[number]

interface FlagTypeConfig {
  // Display label matching the webapp's Type filter (NUMERIC shows as "Number").
  label: string
  // The JS `typeof` an override of this type must have (the DatadogDevtools wrapper would otherwise
  // throw at resolve time); used by validateOverrideValue.
  expectedJsType: 'boolean' | 'string' | 'number' | 'object'
  // Error copy shown when the manual form fails to parse input of this type. BOOLEAN never fails
  // (its Switch yields a real boolean), so its message is unreachable but kept for completeness.
  parseErrorMessage: string
}

// Per-type display + validation metadata in one descriptor: FLAG_TYPES stays the ordered list, while
// this is the single exhaustive source of everything specific to each type.
export const FLAG_TYPE_CONFIG = {
  BOOLEAN: { label: 'Boolean', expectedJsType: 'boolean', parseErrorMessage: 'Enter true or false' },
  STRING: { label: 'String', expectedJsType: 'string', parseErrorMessage: 'Enter a value' },
  INTEGER: {
    label: 'Integer',
    expectedJsType: 'number',
    parseErrorMessage: 'Enter a whole number within the safe integer range',
  },
  NUMERIC: { label: 'Number', expectedJsType: 'number', parseErrorMessage: 'Enter a valid number' },
  JSON: { label: 'JSON', expectedJsType: 'object', parseErrorMessage: 'Enter valid JSON' },
} satisfies Record<FlagType, FlagTypeConfig>

export type TypedParseResult = { ok: true; value: unknown } | { ok: false }

// Structural parsing rules for a flag value string, shared between the catalog (API variant values,
// always strings, tolerant of malformed input) and the manual override form (user input, rejects
// malformed input). BOOLEAN is excluded: the API sends it as the strings 'true'/'false' while the
// form already gets a JS boolean from its Switch control, so there's no shared string-parsing rule
// for it. Callers decide what an `{ ok: false }` result means for them (fall back vs. reject).
export function parseTypedString(type: Exclude<FlagType, 'BOOLEAN'>, raw: string): TypedParseResult {
  switch (type) {
    case 'INTEGER': {
      // Require the whole (trimmed) string to be an integer within the safe range, so a value like
      // "5abc" or 9007199254740993 isn't silently rounded or truncated.
      const trimmed = raw.trim()
      const parsed = Number(trimmed)
      return /^[+-]?\d+$/.test(trimmed) && Number.isSafeInteger(parsed) ? { ok: true, value: parsed } : { ok: false }
    }
    case 'NUMERIC': {
      // Require a non-empty (trimmed) string that parses fully to a finite number — Number('') is 0
      // and Number('  ') is also 0, so an all-whitespace input must not be treated as valid.
      const trimmed = raw.trim()
      const parsed = Number(trimmed)
      return trimmed !== '' && Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false }
    }
    case 'JSON':
      try {
        return { ok: true, value: JSON.parse(raw) as unknown }
      } catch {
        return { ok: false }
      }
    case 'STRING':
      return { ok: true, value: raw }
  }
}

/**
 * Validates an already-parsed override value against its declared type, returning an error message
 * or null if valid. This is the value-level counterpart to parseTypedString (which turns a string
 * into a value): the catalog's variant-click path validates the catalog value directly, and the
 * manual form validates after parseTypedString produces a value.
 *
 * `allowNull` accepts `null` (a valid JSON value that real flag variants can use) — the catalog
 * passes it so a JSON `null` variant stays applyable; the manual-entry form leaves it off so a
 * hand-typed empty value is still rejected. Either way a non-JSON `null` still fails the type check.
 */
export function validateOverrideValue(
  type: FlagType,
  value: unknown,
  { allowNull = false }: { allowNull?: boolean } = {}
): string | null {
  if (value === null && !allowNull) {
    return 'Value cannot be null'
  }
  const config: FlagTypeConfig | undefined = FLAG_TYPE_CONFIG[type]
  if (!config) {
    // The catalog API can return a value_type outside our union (a compile-time assumption, not a
    // runtime guarantee — see parseVariantValue); reject rather than crash on a missing descriptor.
    return `Unsupported flag type: ${type}`
  }
  if (typeof value !== config.expectedJsType) {
    return `Value must be a ${config.expectedJsType} for type ${type}`
  }
  if (type === 'INTEGER' && !Number.isSafeInteger(value)) {
    return 'INTEGER value must be a whole number within the safe integer range'
  }
  return null
}
