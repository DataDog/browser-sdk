/**
 * An arbitrary JSON-serialisable object used throughout the SDK to carry event attributes,
 * user-defined properties, and other structured metadata.
 */
export interface Context {
  [x: string]: ContextValue
}

/**
 * A value that can appear anywhere in a {@link Context} tree: scalars, nested objects, arrays,
 * or absent/null values.
 */
export type ContextValue = string | number | boolean | Context | ContextArray | undefined | null

/**
 * An array of {@link ContextValue} items. Defined as a named interface (rather than an inline
 * `Array<ContextValue>`) to allow recursive references in the {@link ContextValue} union.
 *
 * @hidden
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContextArray extends Array<ContextValue> {}
