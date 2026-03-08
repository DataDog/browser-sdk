import * as fs from 'node:fs'
import * as path from 'node:path'
import { globSync } from 'node:fs'
import { minimatch } from 'minimatch'
import { printLog, runMain, printWarning } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'
import { checkPackageJsonFiles } from './lib/checkBrowserSdkPackageJsonFiles.ts'

runMain(() => {
  checkPackageJsonFiles()

  for (const packagePath of globSync('packages/*')) {
    checkBrowserSdkPackage(packagePath)
  }

  printLog('Packages check done.')
})

function checkBrowserSdkPackage(packagePath: string) {
  const packageJson = getPackageJson(packagePath)

  if (packageJson?.private) {
    printWarning(`Skipping private package ${packageJson.name}`)
    return true
  }

  printLog(`Checking ${packagePath}`)

  const packageFiles = getPackageFiles(packagePath)

  checkPackageJsonEntryPoints(packageJson, packageFiles)
  checkFilesField(packageJson, packageFiles)
}

function getPackageFiles(packagePath: string): string[] {
  const output = command`yarn pack --dry-run --json`.withCurrentWorkingDirectory(packagePath).run()
  return output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((entry): entry is { location: string } => 'location' in entry)
    .map((entry) => entry.location)
}

function checkPackageJsonEntryPoints(packageJson: PackageJson, packageFiles: string[]) {
  const filesFromPackageJsonEntryPoints = [packageJson.main, packageJson.module, packageJson.types].filter(Boolean)

  for (const file of filesFromPackageJsonEntryPoints) {
    if (!packageFiles.includes(file)) {
      throw new Error(`File ${file} used as an entry point in ${packageJson.name} is missing from the package`)
    }
  }
}

// Files always included by yarn/npm regardless of the `files` field
const ALWAYS_INCLUDED_FILES = new Set(['package.json', 'README.md', 'LICENSE'])

function checkFilesField(packageJson: PackageJson, packageFiles: string[]) {
  if (!packageJson.files) {
    throw new Error(`Package ${packageJson.name} is missing the "files" field`)
  }

  const unexpectedFiles = packageFiles.filter((file) => {
    if (ALWAYS_INCLUDED_FILES.has(file)) {
      return false
    }
    let matched = false
    for (let pattern of packageJson.files!) {
      const negated = pattern.startsWith('!')
      if (negated) {
        pattern = pattern.slice(1)
      }
      // Normalize directory patterns (e.g. "cjs" → "cjs/**") for glob matching
      pattern = pattern.includes('*') || pattern.includes('?') ? pattern : `${pattern}/**`
      if (minimatch(file, pattern)) {
        matched = !negated
      }
    }
    return !matched
  })

  if (unexpectedFiles.length > 0) {
    throw new Error(
      `Package ${packageJson.name} contains files not covered by the "files" field:\n${unexpectedFiles.map((f) => `  - ${f}`).join('\n')}`
    )
  }
}

function getPackageJson(packagePath: string) {
  return globSync(path.join(packagePath, 'package.json')).map(
    (packageJsonFile) => JSON.parse(fs.readFileSync(packageJsonFile, 'utf8')) as PackageJson
  )[0]
}

interface PackageJson {
  name: string
  private?: boolean
  main: string
  module: string
  types: string
  files?: string[]
}
