// Load all JSON schema files from the rum-events-format submodule.
// Uses Vite's import.meta.glob (replaces webpack's require.context).
const schemaModules = import.meta.glob('../../../rum-events-format/schemas/**/*.json', { eager: true })

export const allJsonSchemas = Object.values(schemaModules).map((mod: any) => mod.default || mod)
