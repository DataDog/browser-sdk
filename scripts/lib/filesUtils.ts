import fs from 'fs'
import path from 'path'
import fsPromises from 'fs/promises'
import { command } from './command.ts'

const CI_FILE = '.gitlab-ci.yml'

function readCiFileVariable(variableName: string): string | undefined {
  const regexp = new RegExp(`${variableName}: (.*)`)
  const ciFileContent = fs.readFileSync(CI_FILE, { encoding: 'utf-8' })
  return regexp.exec(ciFileContent)?.[1]
}

async function forEachFile(directoryPath: string, callback: (filePath: string) => Promise<void> | void): Promise<void> {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = `${directoryPath}/${entry.name}`
    if (entry.isFile()) {
      await callback(entryPath)
    } else if (entry.isDirectory()) {
      await forEachFile(entryPath, callback)
    }
  }
}

async function replaceCiFileVariable(variableName: string, value: string): Promise<void> {
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
async function modifyFile(filePath: string, modifier: (content: string) => string | Promise<string>): Promise<boolean> {
  const content = await fsPromises.readFile(filePath, { encoding: 'utf-8' })
  const modifiedContent = await modifier(content)
  if (content !== modifiedContent) {
    await fsPromises.writeFile(filePath, modifiedContent)
    return true
  }
  return false
}

interface PackageJsonInfo {
  relativePath: string
  path: string
  content: any
}

function findBrowserSdkPackageJsonFiles(): PackageJsonInfo[] {
  const manifestPaths = command`git ls-files -- package.json */package.json`.run()
  return manifestPaths
    .trim()
    .split('\n')
    .map((manifestPath) => {
      const absoluteManifestPath = path.join(import.meta.dirname, '../..', manifestPath)
      return {
        relativePath: manifestPath,
        path: absoluteManifestPath,
        content: JSON.parse(fs.readFileSync(absoluteManifestPath, 'utf-8')),
      }
    })
}

export { CI_FILE, readCiFileVariable, replaceCiFileVariable, modifyFile, findBrowserSdkPackageJsonFiles, forEachFile }
