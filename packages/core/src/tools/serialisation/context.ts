export interface Context {
  [x: string]: ContextValue
}

export type ContextValue = string | number | boolean | Context | ContextArray | undefined | null

/**
 * @hidden
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContextArray extends Array<ContextValue> {}
