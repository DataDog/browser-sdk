const modules = import.meta.glob('../../node_modules/@datadog/rum-events-format/schemas/**/*.json', { eager: true })
export const allJsonSchemas = Object.values(modules)
