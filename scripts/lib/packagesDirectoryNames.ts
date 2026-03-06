import { readdirSync } from 'node:fs'

export const packagesDirectoryNames: string[] = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
