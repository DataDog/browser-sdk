import fs from 'node:fs'
import path from 'node:path'
import fsPromises from 'node:fs/promises'
import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import { command } from './command.ts'

export const CI_FILE = '.gitlab-ci.yml'

export function readCiFileVariable(variableName: string): string | undefined {
  const regexp = new RegExp(`${variableName}: (.*)`)
  const ciFileContent = fs.readFileSync(CI_FILE, { encoding: 'utf-8' })
  return regexp.exec(ciFileContent)?.[1]
}

export async function forEachFile(
  directoryPath: string,
  callback: (filePath: string) => Promise<void> | void
): Promise<void> {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = `${directoryPath}/${entry.name}`
    if (entry.isFile()) {
      await callback(entryPath)
    } else if (entry.isDirectory()) {
      await forEachFile(entryPath, callback)
    }
  }
}

export async function replaceCiFileVariable(variableName: string, value: string): Promise<void> {
  await modifyFile(CI_FILE, (content) =>
    content.replace(new RegExp(`${variableName}: .*`), `${variableName}: ${value}`)
  )
}

/**
 * Modify a file.
 *
 * @param filePath - {string}
 * @param modifier - {(content: string) => string | Promise<string>}
 */
export async function modifyFile(
  filePath: string,
  modifier: (content: string) => string | Promise<string>
): Promise<boolean> {
  const content = await fsPromises.readFile(filePath, { encoding: 'utf-8' })
  const modifiedContent = await modifier(content)
  if (content !== modifiedContent) {
    await fsPromises.writeFile(filePath, modifiedContent)
    return true
  }
  return false
}

export interface PackageJsonInfo {
  relativePath: string
  path: string
  content: PackageJson
}

export interface PackageJson {
  name?: string
  private?: boolean
  version?: string
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export function readPackageJson(filePath: string): PackageJson {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PackageJson
}

/**
 * Directories of the packages that release-please releases as their own component, with their own
 * version (e.g. `packages/js-core`). They are still built and published as part of the same release
 * process. All the other packages use the Browser SDK version (the root component).
 */
const INDEPENDENTLY_VERSIONED_PACKAGE_DIRECTORIES = new Set(
  Object.keys(releasePleaseConfig.packages).filter((directory) => directory !== '.')
)

/**
 * Returns whether the given package is versioned independently from the synced Browser SDK release
 * version. See {@link INDEPENDENTLY_VERSIONED_PACKAGE_DIRECTORIES}.
 */
export function isIndependentlyVersionedPackage({ relativePath }: Pick<PackageJsonInfo, 'relativePath'>): boolean {
  return INDEPENDENTLY_VERSIONED_PACKAGE_DIRECTORIES.has(path.dirname(relativePath))
}

/**
 * Returns whether the given string is an exact semantic version (e.g. `1.2.3`), without range
 * prefixes (`^`, `~`) or pre-release/build metadata.
 */
export function isSemanticVersion(input: string | undefined): boolean {
  return input !== undefined && /^\d+\.\d+\.\d+$/.test(input)
}

let browserSdkPackageNames: Set<string> | undefined

/**
 * Returns whether the given name is a Browser SDK package defined in this monorepo (under
 * `packages/`).
 */
export function isBrowserSdkPackageName(name: string): boolean {
  browserSdkPackageNames ??= new Set(
    findPackageJsonFiles()
      .filter((packageJsonFile) => packageJsonFile.relativePath.startsWith('packages/'))
      .map((packageJsonFile) => packageJsonFile.content.name)
      .filter((packageName): packageName is string => Boolean(packageName))
  )
  return browserSdkPackageNames.has(name)
}

export function findPackageJsonFiles(): PackageJsonInfo[] {
  const manifestPaths = command`git ls-files -- package.json */package.json`.run()
  return manifestPaths
    .trim()
    .split('\n')
    .map((manifestPath) => {
      const absoluteManifestPath = path.join(import.meta.dirname, '../..', manifestPath)
      return {
        relativePath: manifestPath,
        path: absoluteManifestPath,
        content: readPackageJson(absoluteManifestPath),
      }
    })
}
