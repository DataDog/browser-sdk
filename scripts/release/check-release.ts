import { browserSdkVersion as releaseVersion } from '../lib/browserSdkVersion.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { findBrowserSdkPackageJsonFiles } from '../lib/filesUtils.ts'

interface PackageJsonFile {
  relativePath: string
  content: {
    name: string
    version: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
}

runMain(() => {
  checkGitTag()
  checkBrowserSdkPackageJsonFiles()

  printLog('Release check done.')
})

function checkGitTag(): void {
  printLog('Checking release version tag is on HEAD')
  const headRef = command`git rev-parse HEAD`.run()
  let tagRef: string
  try {
    tagRef = command`git rev-list -n 1 v${releaseVersion} --`.run()
  } catch (error) {
    throw new Error(`Failed to find git tag reference: ${error as string}`)
  }
  if (tagRef !== headRef) {
    throw new Error('Git tag not on HEAD')
  }
}

function checkBrowserSdkPackageJsonFiles(): void {
  const packageJsonFiles = findBrowserSdkPackageJsonFiles()

  printLog(
    `Checking package.json files:
   - ${packageJsonFiles.map((packageJsonFile) => packageJsonFile.relativePath).join('\n   - ')}
`
  )

  for (const packageJsonFile of packageJsonFiles) {
    checkPackageJsonVersion(packageJsonFile)
    checkPackageDependencyVersions(packageJsonFile)
  }
}

function checkPackageJsonVersion(packageJsonFile: PackageJsonFile): void {
  if (
    isBrowserSdkPublicPackageName(packageJsonFile.content.name) &&
    packageJsonFile.content.version !== releaseVersion
  ) {
    throw new Error(
      `Invalid version for ${packageJsonFile.relativePath}: expected ${releaseVersion}, got ${packageJsonFile.content.version}`
    )
  }
}

function checkPackageDependencyVersions(packageJsonFile: PackageJsonFile): void {
  for (const dependencies of [
    packageJsonFile.content.dependencies,
    packageJsonFile.content.devDependencies,
    packageJsonFile.content.peerDependencies,
  ]) {
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (
        isBrowserSdkPublicPackageName(dependencyName) &&
        !dependencyVersion.startsWith('workspace:') &&
        !dependencyVersion.startsWith('file:') &&
        dependencyVersion !== releaseVersion
      ) {
        throw new Error(
          `Invalid dependency version for ${dependencyName} in ${packageJsonFile.relativePath}: expected ${releaseVersion}, got ${dependencyVersion}`
        )
      }
    }
  }
}

function isBrowserSdkPublicPackageName(name: string): boolean {
  return /^@datadog\/[^/]+$/.test(name)
}
