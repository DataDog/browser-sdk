import { DOCS_ORIGIN, MORE_DETAILS } from '../util/display'
import type { Display } from '../util/display'
import { isPercentage, isMatchOption } from '../util/typeUtils'
import { deepClone } from '../util/mergeInto'

// ──────────────────────────────────────────────────────────────────────────────
// Schema field types
// ──────────────────────────────────────────────────────────────────────────────

/** A value that can match against a string: an exact string, a RegExp, or a predicate function. */
export type MatchOption = string | RegExp | ((value: string) => boolean)

/**
 * Controls whether a field is required, and what it falls back to when absent.
 * A field is either `required: true` (no default allowed), has an explicit `default`,
 * or is optional with no default (resolves to `undefined` when absent).
 */
export type Optionality =
  { required: true; default?: never } | { required?: false; default: unknown } | { required?: false }

/**
 * When `multiple: true`, the field expects an array instead of a single value; each item
 * is validated against the field's base type.
 */
export interface Multiple {
  /** When `true`, the field expects an array; each item is validated by the base type. */
  multiple?: true
}

/**
 * When `strict: false`, a value that fails validation falls back to the field's default
 * instead of aborting the whole configuration. Defaults to `true` (abort). Use this for
 * backward-compatible relaxation of validation on a field.
 */
export interface Strict {
  /** When `false`, an invalid value falls back to the default instead of aborting. Defaults to `true`. */
  strict?: false
}

/** A free-text string field. Rejects empty strings. */
export type StringField = { type: 'string' } & Optionality & Multiple & Strict

/** A numeric field constrained to the 0–100 range, typically used for sample rates. */
export type PercentageField = { type: 'percentage' } & Optionality & Multiple & Strict

/**
 * A boolean field. When `strict: false`, a non-boolean value is coerced with `!!value`
 * instead of being rejected.
 */
export type BooleanField = { type: 'boolean' } & Optionality & Multiple & Strict

/** Validates that the value looks like a Datadog site (matches `/(datadog|ddog|datad0g|dd0g)/`). */
export type SiteField = { type: 'site' } & Optionality & Multiple & Strict

/** Accepts a {@link MatchOption}: a string, a RegExp, or a predicate function. */
export type MatchOptionField = { type: 'match-option' } & Optionality & Multiple & Strict

/**
 * Restricts the value to one of a fixed set of values, given either as an array of strings
 * or as an object mapping (e.g. a TypeScript const object used as an enum).
 * `allowAll: true` (only meaningful combined with `multiple: true`) accepts the string
 * `'all'` as shorthand for every value in the set.
 */
export type EnumField =
  | ({ type: 'enum'; values: readonly string[]; allowAll?: true } & Optionality & Multiple & Strict)
  | ({ type: 'enum'; values: Record<string, string>; allowAll?: true } & Optionality & Multiple & Strict)

/** Tries each variant in `variants`, in order, and uses the first one that validates successfully. */
export type UnionField = {
  type: 'union'
  variants: readonly FieldDef[]
} & Optionality &
  Multiple &
  Strict

/**
 * Validates a nested object against a sub-schema, producing a nested {@link InferredConfig}.
 * Resolves to `undefined` if the sub-schema validation fails.
 */
export type SchemaField = {
  type: 'schema'
  schema: ConfigurationSchema
} & Optionality &
  Multiple &
  Strict

/** A field expecting a function value. */
export type FunctionField = {
  type: 'function'
  /**
   * Phantom property, never set at runtime. Assign `undefined as YourFnType | undefined`
   * to make {@link InferredConfig} infer that specific function type instead of the generic
   * `(...args: unknown[]) => unknown` fallback.
   */
  signature?: ((...args: any[]) => any) | undefined
} & Optionality &
  Multiple &
  Strict

/** The union of all field definition types supported by a {@link ConfigurationSchema}. */
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

/**
 * A declarative map of field names to their {@link FieldDef}, used to derive both the
 * validated configuration type (via {@link InferredConfig}) and its runtime validation
 * (via {@link validateAndBuildConfiguration}).
 */
export interface ConfigurationSchema {
  /** The field definition for a given configuration key. */
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
// A field is always present (never undefined) once validated if it's required or has a default.
type IsFieldRequired<F extends FieldDef> = F extends { required: true }
  ? true
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    F extends { default: {} }
    ? true
    : false

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

type RequiredConfigKeys<S extends ConfigurationSchema> = {
  [K in keyof S]: IsFieldRequired<S[K]> extends true ? K : never
}[keyof S]

type OptionalConfigKeys<S extends ConfigurationSchema> = Exclude<keyof S, RequiredConfigKeys<S>>

/**
 * Infers the validated configuration output type for a given {@link ConfigurationSchema} —
 * the return type of {@link validateAndBuildConfiguration} for that schema.
 *
 * Fields that are required or have a default are always present; other fields are optional
 * keys, so consumers building a configuration object literal by hand (e.g. test fixtures) can
 * omit them instead of having to write `field: undefined` explicitly.
 */
export type InferredConfig<S extends ConfigurationSchema> = {
  [K in RequiredConfigKeys<S>]: InferOutput<S[K]>
} & {
  [K in OptionalConfigKeys<S>]?: InferOutput<S[K]>
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
      return `"${key}" must be a valid Datadog site. ${MORE_DETAILS} ${DOCS_ORIGIN}/getting_started/site/.`
    case 'match-option':
      return `"${key}" must be a string, RegExp, or function`
    case 'enum':
      return `"${key}" must be one of: "${getEnumValues(field.values).join('", "')}"`
    case 'union':
      return `"${key}" does not match any expected type`
    case 'schema':
      return `"${key}" is not a valid object`
    case 'function':
      return `"${key}" must be a function`
  }
}

/**
 * Validates a raw init configuration object against a {@link ConfigurationSchema} and builds
 * the corresponding {@link InferredConfig}. Use this to derive a schema-driven configuration
 * builder for a package (e.g. `validateAndBuildRumConfiguration`) instead of writing
 * per-field validation by hand.
 *
 * @param initConfig - The raw, untrusted configuration object provided by the SDK consumer.
 * @param schema - The {@link ConfigurationSchema} describing every field to validate.
 * @param display - Optional error reporter; when provided, validation failures are reported
 * through `display.error` with a message naming the offending field.
 * @returns The validated, defaulted configuration, or `undefined` if `initConfig` is missing
 * or a required/strict field failed validation.
 */
export function validateAndBuildConfiguration<S extends ConfigurationSchema>(
  initConfig: unknown,
  schema: S,
  display: Display
): InferredConfig<S> | undefined {
  if (!initConfig || typeof initConfig !== 'object') {
    display.error('Configuration must be an object')
    return undefined
  }

  return validateSchemaFields(schema, initConfig as Record<string, unknown>, display) as InferredConfig<S> | undefined
}

/**
 * Validates every field of `schema` against `rawConfig`. Shared by {@link validateAndBuildConfiguration}
 * and nested `type: 'schema'` field validation. `display` is threaded down into nested fields
 * (`type: 'schema'`, `type: 'union'`, `multiple: true`) so a nested validation failure reports
 * its own specific message, in addition to the outer field's generic message.
 */
function validateSchemaFields(
  schema: ConfigurationSchema,
  rawConfig: Record<string, unknown>,
  display: Display
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {}

  for (const [key, field] of Object.entries(schema)) {
    const rawValue = rawConfig[key]
    const validated = field.multiple
      ? validateArrayField(field, rawValue, display)
      : validateField(field, rawValue, display)

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
      // Schema-owned array/object defaults (e.g. `default: []`) are shared across every
      // validation call; clone so mutating one built configuration can't affect another.
      result[key] = 'default' in field ? deepClone(field.default) : undefined
    } else {
      result[key] = validated
    }
  }

  return result
}

function validateArrayField(field: FieldDef, value: unknown, display: Display): unknown {
  if (value === undefined || value === null) {
    return undefined
  }
  // 'all' shorthand: expand to the full set of enum values
  if (field.type === 'enum' && field.allowAll && value === 'all') {
    return getEnumValues(field.values)
  }
  // Normalize a single value to a singleton array for convenience
  const items = Array.isArray(value) ? value : [value]
  const results: unknown[] = []
  for (const item of items) {
    const validated = validateField(field, item, display)
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

function validateField(field: FieldDef, value: unknown, display: Display): unknown {
  if (field.type === 'schema') {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }
    return validateSchemaFields(field.schema, value as Record<string, unknown>, display)
  }

  if (field.type === 'union') {
    if (value === undefined || value === null) {
      return undefined
    }
    for (const variant of field.variants) {
      const result = validateField(variant, value, display)
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
      return isPercentage(value) ? value : undefined
    case 'boolean':
      return typeof value === 'boolean' ? value : field.strict === false ? !!value : undefined
    case 'site':
      if (typeof value !== 'string' || !DATADOG_SITE_REGEX.test(value)) {
        return undefined
      }
      return value
    case 'match-option':
      return isMatchOption(value) ? value : undefined
    case 'enum':
      return typeof value === 'string' && getEnumValues(field.values).includes(value) ? value : undefined
  }
}

function getEnumValues(values: EnumField['values']): readonly string[] {
  return isReadonlyStringArray(values) ? values : Object.values(values)
}

// `Array.isArray`'s built-in predicate narrows to `any[]`, which degrades a
// `readonly string[] | Record<string, string>` union to `any[]` instead of `readonly string[]`.
function isReadonlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
}
