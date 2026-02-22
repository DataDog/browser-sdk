const modules = import.meta.glob('../../../../rum-events-format/schemas/**/*.json', { eager: true })
export const allJsonSchemas = Object.values(modules)
