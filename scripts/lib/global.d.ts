declare module 'emoji-name-map' {
  export function get(emoji: string): string | undefined
}

declare module 'json-schema-to-typescript' {
  export function compileFromFile(schemaPath: string, options: any): Promise<string>
}
