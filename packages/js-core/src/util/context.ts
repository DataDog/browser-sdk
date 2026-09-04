/**
 * A free-form object mapping string keys to context values, used for user, account, and
 * global contexts throughout the SDK.
 */
export interface Context {
  [x: string]: ContextValue
}

/**
 * A primitive, nested object, or array value accepted in a {@link Context}.
 */
export type ContextValue = string | number | boolean | Context | ContextArray | undefined | null

/**
 * An array of {@link ContextValue} items, used when a {@link Context} contains an array value.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContextArray extends Array<ContextValue> {}
