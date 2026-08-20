// Shared flag and override types plus the per-type value logic (labels, parsing, validation) they
// drive. One home for everything specific to a flag's value type, imported by both the
// request/catalog layer and the inspected-page override layer.

/** Feature-flag value types, in display order (drives the catalog's Type filter). */
export const FLAG_TYPES = ['BOOLEAN', 'STRING', 'INTEGER', 'NUMERIC', 'JSON'] as const

/** The value type of a feature flag, and of an override for it. */
export type FlagType = (typeof FLAG_TYPES)[number]

interface FlagTypeConfig {
  /** Display label matching the webapp's Type filter (NUMERIC shows as "Number"). */
  label: string
  /** The JS `typeof` an override must have, or the DatadogDevtools wrapper throws at resolve time. */
  expectedJsType: 'boolean' | 'string' | 'number' | 'object'
  /** Error copy for the manual form. BOOLEAN's is unreachable (its Switch yields a real boolean). */
  parseErrorMessage: string
}

/** Everything specific to each type; FLAG_TYPES stays the ordered list. */
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

/**
 * Parses a flag value string, shared between the catalog (API variant values, which tolerate
 * malformed input) and the manual override form (which rejects it) — callers decide what
 * `{ ok: false }` means for them. BOOLEAN is excluded: the API sends 'true'/'false' strings while
 * the form's Switch already yields a JS boolean, so there's no shared rule for it.
 */
export function parseTypedString(type: Exclude<FlagType, 'BOOLEAN'>, raw: string): TypedParseResult {
  switch (type) {
    case 'INTEGER': {
      // The whole trimmed string must be a safe integer, so "5abc" or 9007199254740993 isn't
      // silently truncated or rounded.
      const trimmed = raw.trim()
      const parsed = Number(trimmed)
      return /^[+-]?\d+$/.test(trimmed) && Number.isSafeInteger(parsed) ? { ok: true, value: parsed } : { ok: false }
    }
    case 'NUMERIC': {
      // Reject empty/whitespace explicitly — Number('') and Number('  ') are both 0.
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
 * Flags an override the connected site can't honour: no active flag holds the key, or one does but
 * the stored type disagrees. localStorage has no site concept, so the usual cause is an override
 * left by another Datadog site — though a flag archived here, or a manual override applied with the
 * wrong type, land here too, and a key that exists identically on both sites is missed entirely.
 */
export function isOverrideUnusable(
  flag: { type: FlagType; unresolved?: boolean },
  override: { type: FlagType } | undefined
): boolean {
  return override !== undefined && (flag.unresolved === true || override.type !== flag.type)
}

/**
 * Validates an already-parsed override value against its declared type, returning an error message
 * or null. The value-level counterpart to parseTypedString: the catalog's variant-click path
 * validates its value directly, and the manual form validates what parseTypedString produced.
 *
 * `allowNull` accepts `null`, a valid JSON value real variants can use — the catalog passes it so a
 * JSON `null` variant stays applyable, the form leaves it off so an empty value is rejected. A
 * non-JSON `null` still fails the type check either way.
 */
export function validateOverrideValue(
  type: FlagType,
  value: unknown,
  { allowNull = false }: { allowNull?: boolean } = {}
): string | null {
  if (value === null && !allowNull) {
    return 'Value cannot be null'
  }
  // The API can return a value_type outside our union (a compile-time assumption, not a runtime
  // guarantee — see parseVariantValue), so reject rather than crash on a missing descriptor.
  const config: FlagTypeConfig | undefined = FLAG_TYPE_CONFIG[type]
  if (!config) {
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

/** Display label for a flag type, falling back to the raw type for one we don't model yet. */
export function flagTypeLabel(type: FlagType): string {
  const config: FlagTypeConfig | undefined = FLAG_TYPE_CONFIG[type]
  return config ? config.label : type
}
