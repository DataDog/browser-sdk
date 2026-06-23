import type { Display } from '../util/display'

// ──────────────────────────────────────────────────────────────────────────────
// Schema field types
// ──────────────────────────────────────────────────────────────────────────────

/** A value that can match against a string: an exact string, a RegExp, or a predicate function. */
export type MatchOption = string | RegExp | ((value: string) => boolean)

type Optionality = { required: true; default?: never } | { required?: false; default: unknown } | { required?: false }
// multiple: true — field expects an array; each item is validated by the base type.
interface Multiple {
  multiple?: true
}
// strict: false — when a provided value fails validation, fall back to the default instead of
// aborting. Defaults to true (abort). Use for backward-compatible relaxation of validation.
interface Strict {
  strict?: false
}

export type StringField = { type: 'string' } & Optionality & Multiple & Strict
export type PercentageField = { type: 'percentage' } & Optionality & Multiple & Strict
export type BooleanField = { type: 'boolean' } & Optionality & Multiple & Strict
// Validates that the value looks like a Datadog site (/(datadog|ddog|datad0g|dd0g)/ regex).
export type SiteField = { type: 'site' } & Optionality & Multiple & Strict
// Accepts string | RegExp | function — valid MatchOption values.
export type MatchOptionField = { type: 'match-option' } & Optionality & Multiple & Strict
// allowAll: true — only valid with multiple: true. Accepts the string 'all' as a shorthand
// for the full set of values.
export type EnumField =
  | ({ type: 'enum'; values: readonly string[]; allowAll?: true } & Optionality & Multiple & Strict)
  | ({ type: 'enum'; values: Record<string, string>; allowAll?: true } & Optionality & Multiple & Strict)
// Tries each variant in order; uses the first that returns a non-undefined value.
export type UnionField = {
  type: 'union'
  variants: readonly FieldDef[]
} & Optionality &
  Multiple &
  Strict
// Validates a nested object against a sub-schema; returns the validated sub-config or undefined.
export type SchemaField = {
  type: 'schema'
  schema: ConfigurationSchema
} & Optionality &
  Multiple &
  Strict
// signature — phantom property, never set at runtime. Assign `undefined as YourFnType | undefined`
// to make InferredConfig infer a specific function type instead of the generic fallback.
export type FunctionField = {
  type: 'function'
  signature?: ((...args: any[]) => any) | undefined
} & Optionality &
  Multiple &
  Strict

export type FieldDef =
  | StringField
  | PercentageField
  | BooleanField
  | SiteField
  | MatchOptionField
  | EnumField
  | UnionField
  | SchemaField
  | FunctionField

export interface ConfigurationSchema {
  readonly [key: string]: FieldDef
}

// ──────────────────────────────────────────────────────────────────────────────
// Output type inference
// ──────────────────────────────────────────────────────────────────────────────

type InferBase<F extends FieldDef> = F extends { type: 'string' }
  ? string
  : F extends { type: 'percentage' }
    ? number
    : F extends { type: 'boolean' }
      ? boolean
      : F extends { type: 'site' }
        ? string
        : F extends { type: 'match-option' }
          ? MatchOption
          : F extends { type: 'enum'; values: ReadonlyArray<infer V> }
            ? V
            : F extends { type: 'enum'; values: Record<string, infer V> }
              ? V
              : F extends { type: 'union'; variants: infer V }
                ? V extends readonly FieldDef[]
                  ? { [K in keyof V]: InferVariant<V[K]> }[number]
                  : never
                : F extends { type: 'schema'; schema: infer S }
                  ? S extends ConfigurationSchema
                    ? InferredConfig<S>
                    : never
                  : F extends { type: 'function'; signature: infer Sig }
                    ? NonNullable<Sig>
                    : F extends { type: 'function' }
                      ? (...args: unknown[]) => unknown
                      : never

// Non-recursive variant of InferBase used inside UnionField to avoid infinite type instantiation.
type InferVariant<F> = F extends { type: 'string' }
  ? string
  : F extends { type: 'percentage' }
    ? number
    : F extends { type: 'boolean' }
      ? boolean
      : F extends { type: 'site' }
        ? string
        : F extends { type: 'match-option' }
          ? MatchOption
          : F extends { type: 'enum'; values: ReadonlyArray<infer V> }
            ? V
            : F extends { type: 'enum'; values: Record<string, infer V> }
              ? V
              : F extends { type: 'schema'; schema: infer S }
                ? S extends ConfigurationSchema
                  ? InferredConfig<S>
                  : unknown
                : F extends { type: 'function'; signature: infer Sig }
                  ? NonNullable<Sig>
                  : F extends { type: 'function' }
                    ? (...args: unknown[]) => unknown
                    : unknown

// `{ default: {} }` matches any non-null/undefined default value
type InferScalar<F extends FieldDef> = F extends { required: true }
  ? InferBase<F>
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    F extends { default: {} }
    ? NonNullable<InferBase<F>>
    : InferBase<F> | undefined

type InferOutput<F extends FieldDef> = F extends { multiple: true }
  ? F extends { required: true }
    ? Array<InferBase<F>>
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      F extends { default: {} }
      ? Array<NonNullable<InferBase<F>>>
      : Array<InferBase<F>> | undefined
  : InferScalar<F>

export type InferredConfig<S extends ConfigurationSchema> = {
  [K in keyof S]: InferOutput<S[K]>
}

// ──────────────────────────────────────────────────────────────────────────────
// Runtime validation
// ──────────────────────────────────────────────────────────────────────────────

function buildErrorMessage(key: string, field: FieldDef): string {
  switch (field.type) {
    case 'string':
      return `"${key}" must be a non-empty string`
    case 'percentage':
      return `"${key}" must be a number between 0 and 100`
    case 'boolean':
      return `"${key}" must be a boolean`
    case 'site':
      return `"${key}" must be a valid Datadog site. More details: https://docs.datadoghq.com/getting_started/site/.`
    case 'match-option':
      return `"${key}" must be a string, RegExp, or function`
    case 'enum': {
      const values = Array.isArray(field.values) ? field.values : Object.values(field.values)
      return `"${key}" must be one of: "${values.join('", "')}"`
    }
    case 'union':
      return `"${key}" does not match any expected type`
    case 'schema':
      return `"${key}" is not a valid object`
    case 'function':
      return `"${key}" must be a function`
  }
}

export function validateAndBuildConfiguration<S extends ConfigurationSchema>(
  initConfig: unknown,
  schema: S,
  display: Display
): InferredConfig<S> | undefined {
  if (!initConfig || typeof initConfig !== 'object') {
    display.error('Configuration must be an object')
    return undefined
  }

  const result: Record<string, unknown> = {}
  const rawConfig = initConfig as Record<string, unknown>

  for (const [key, field] of Object.entries(schema)) {
    const rawValue = rawConfig[key]
    const validated = field.multiple ? validateArrayField(field, rawValue) : validateField(field, rawValue)

    if (validated === undefined) {
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        display.error(buildErrorMessage(key, field))
        if (field.required || field.strict !== false) {
          return undefined
        }
      } else if (field.required) {
        display.error(`"${key}" is required`)
        return undefined
      }
      result[key] = 'default' in field ? field.default : undefined
    } else {
      result[key] = validated
    }
  }

  return result as InferredConfig<S>
}

function validateArrayField(field: FieldDef, value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined
  }
  // 'all' shorthand: expand to the full set of enum values
  if (field.type === 'enum' && field.allowAll && value === 'all') {
    return Array.isArray(field.values) ? ([] as string[]).concat(field.values) : Object.values(field.values)
  }
  // Normalize a single value to a singleton array for convenience
  const items = Array.isArray(value) ? value : [value]
  const results: unknown[] = []
  for (const item of items) {
    const validated = validateField(field, item)
    if (validated === undefined) {
      if (field.strict !== false) {
        return undefined
      }
    } else {
      results.push(validated)
    }
  }
  // All provided items were invalid: treat as absent so the caller applies the default.
  if (field.strict === false && results.length === 0 && items.length > 0) {
    return undefined
  }
  return results
}

const DATADOG_SITE_REGEX = /(datadog|ddog|datad0g|dd0g)/

function validateInnerSchema(
  schema: ConfigurationSchema,
  obj: Record<string, unknown>
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema)) {
    const rawValue = obj[key]
    const validated = field.multiple ? validateArrayField(field, rawValue) : validateField(field, rawValue)
    if (validated === undefined) {
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        if (field.required || field.strict !== false) {
          return undefined
        }
      } else if (field.required) {
        return undefined
      }
      result[key] = 'default' in field ? field.default : undefined
    } else {
      result[key] = validated
    }
  }
  return result
}

function validateField(field: FieldDef, value: unknown): unknown {
  if (field.type === 'schema') {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }
    return validateInnerSchema(field.schema, value as Record<string, unknown>)
  }

  if (field.type === 'union') {
    if (value === undefined || value === null) {
      return undefined
    }
    for (const variant of field.variants) {
      const result = validateField(variant, value)
      if (result !== undefined) {
        return result
      }
    }
    return undefined
  }

  if (value === undefined || value === null) {
    return undefined
  }

  switch (field.type) {
    case 'function':
      return typeof value === 'function' ? value : undefined
    case 'string':
      return typeof value === 'string' && value.length > 0 ? value : undefined
    case 'percentage':
      return typeof value === 'number' && value >= 0 && value <= 100 ? value : undefined
    case 'boolean':
      return typeof value === 'boolean' ? value : field.strict === false ? !!value : undefined
    case 'site':
      if (typeof value !== 'string' || !DATADOG_SITE_REGEX.test(value)) {
        return undefined
      }
      return value
    case 'match-option':
      return typeof value === 'string' || value instanceof RegExp || typeof value === 'function' ? value : undefined
    case 'enum':
      if (Array.isArray(field.values)) {
        return typeof value === 'string' && field.values.includes(value) ? value : undefined
      }
      return typeof value === 'string' && Object.values(field.values).includes(value) ? value : undefined
  }
}
