// Feature-flag value types, in display order (drives the catalog's Type filter).
export const FLAG_TYPES = ['BOOLEAN', 'STRING', 'INTEGER', 'NUMERIC', 'JSON'] as const

// The value type of a feature flag, derived from FLAG_TYPES so the list stays the single source.
export type FlagType = (typeof FLAG_TYPES)[number]

// Display labels matching the webapp's Type filter (NUMERIC shows as "Number").
export const TYPE_LABELS = {
  BOOLEAN: 'Boolean',
  STRING: 'String',
  INTEGER: 'Integer',
  NUMERIC: 'Number',
  JSON: 'JSON',
} satisfies Record<FlagType, string>
