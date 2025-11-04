import { readdirSync } from 'node:fs'

export const packagesDirectoryNames: string[] = readdirSync('packages')
