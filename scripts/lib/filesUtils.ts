import * as fs from 'fs'
import * as path from 'path'
import * as fsPromises from 'fs/promises'
import { command } from './command'

export const CI_FILE = '.gitlab-ci.yml'

export function readCiFileVariable(variableName: string): string | undefined {
  const regexp = new RegExp(`${variableName}: (.*)`)
  const ciFileContent = fs.readFileSync(CI_FILE, { encoding: 'utf-8' })
  return regexp.exec(ciFileContent)?.[1]
}

export async function forEachFile(directoryPath: string, callback: (filePath: string) => Promise<void>): Promise<void> {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = `${directoryPath}/${entry.name}`
    if (entry.isFile()) {
      await callback(entryPath)
    } else if (entry.isDirectory()) {
      await forEachFile(entryPath, callback)
    }
  }
}

export function replaceCiFileVariable(variableName: string, value: string): Promise<boolean> {
  return modifyFile(CI_FILE, (content) =>
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

interface PackageJsonFile {
  relativePath: string
  path: string
  content: any
}

export function findBrowserSdkPackageJsonFiles(): PackageJsonFile[] {
  const manifestPaths = command`git ls-files -- package.json */package.json`.run()
  return manifestPaths
    .trim()
    .split('\n')
    .map((manifestPath) => {
      const absoluteManifestPath = path.join(__dirname, '../..', manifestPath)
      return {
        relativePath: manifestPath,
        path: absoluteManifestPath,
        content: require(absoluteManifestPath),
      }
    })
}
