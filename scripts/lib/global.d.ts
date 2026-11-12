declare module 'emoji-name-map' {
  export function get(emoji: string): string | undefined
}

// Declare the `json-schema-to-typescript` types because it is not a project dependency (see scripts/json-schemas.ts).
declare module 'json-schema-to-typescript' {
  export type Options = any
  export function compileFromFile(schemaPath: string, options: Partial<Options>): Promise<string>
}
