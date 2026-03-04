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
  checkNpmIgnore(packagePath, packageFiles)
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

// NPM will [always include some files][1] like `package.json` and `README.md`.
// [1]: https://docs.npmjs.com/cli/v9/using-npm/developers#keeping-files-out-of-your-package
const FILES_ALWAYS_INCLUDED_BY_NPM = ['package.json', 'README.md']

function checkNpmIgnore(packagePath: string, packageFiles: string[]) {
  const npmIgnorePath = path.join(packagePath, '.npmignore')
  const npmNegatedIgnoreRules = fs
    .readFileSync(npmIgnorePath, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((glob) => new minimatch.Minimatch(glob, { dot: true, matchBase: true, flipNegate: true }))
    .filter((rule) => rule.negate)

  // Ensure that each file is explicitly included by checking if at least a negated rule matches it
  for (const file of packageFiles) {
    if (!FILES_ALWAYS_INCLUDED_BY_NPM.includes(file) && !npmNegatedIgnoreRules.some((rule) => rule.match(`/${file}`))) {
      throw new Error(`File ${file} is not explicitly included in ${npmIgnorePath}`)
    }
  }

  // Ensure that expected files are correctly included by checking if each negated rule matches at least one file
  for (const rule of npmNegatedIgnoreRules) {
    if (!packageFiles.some((file) => rule.match(`/${file}`))) {
      throw new Error(`Rule ${rule.pattern} does not match any file ${npmIgnorePath}`)
    }
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
}
