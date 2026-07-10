/**
 * A generic, JSON-serializable key/value bag used to type event and context payloads assembled by
 * {@link Hook}.
 */
export interface Context {
  [x: string]: ContextValue
}

/** A value that can be stored in a {@link Context}: a JSON-serializable primitive, nested context, or array. */
export type ContextValue = string | number | boolean | Context | ContextArray | undefined | null

/**
 * An array of {@link ContextValue}s, as found nested inside a {@link Context}.
 *
 * @hidden
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContextArray extends Array<ContextValue> {}
