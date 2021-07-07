export interface Context {
  [x: string]: ContextValue
}

export type ContextValue = string | number | boolean | Context | ContextArray | undefined | null

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContextArray extends Array<ContextValue> {}
