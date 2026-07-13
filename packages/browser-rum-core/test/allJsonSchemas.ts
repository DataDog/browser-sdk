/// <reference types="vite/client" />
// Load all JSON schema files from @datadog/rum-events-format dependency.
// Uses Vite's import.meta.glob (replaces webpack's require.context).
const schemaModules = import.meta.glob('../../../node_modules/@datadog/rum-events-format/schemas/**/*.json', {
  eager: true,
})

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
export const allJsonSchemas = Object.values(schemaModules).map((mod: any) => mod.default || mod)

if (allJsonSchemas.length === 0) {
  throw new Error('No JSON schemas loaded from @datadog/rum-events-format. Check the glob path in allJsonSchemas.ts.')
}
