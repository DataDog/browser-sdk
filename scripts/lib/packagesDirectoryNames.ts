import { readdirSync } from 'fs'

export const packagesDirectoryNames: string[] = readdirSync('packages')
