declare module 'emoji-name-map' {
  export function get(emoji: string): string | undefined
}

// Declare the `json-schema-to-typescript` types because the package might not be always built.
declare module 'json-schema-to-typescript' {
  export type Options = any
  export function compileFromFile(schemaPath: string, options: Partial<Options>): Promise<string>
}
