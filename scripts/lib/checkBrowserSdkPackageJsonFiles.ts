import type { PackageJsonFile } from '../release/check-release.ts'
import { browserSdkVersion as releaseVersion } from './browserSdkVersion.ts'
import { printLog } from './executionUtils.ts'
import { findPackageJsonFiles } from './filesUtils.ts'

export function checkPackageJsonFiles(): void {
  const packageJsonFiles = findPackageJsonFiles()

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
  if (packageJsonFile.content?.private) {
    // The developer extension is a private package, but it should still have a version
    if (
      packageJsonFile.content.version &&
      packageJsonFile.content.name !== '@datadog/browser-sdk-developer-extension'
    ) {
      throw new Error(`Private package ${packageJsonFile.relativePath} should not have a version`)
    }
  } else if (packageJsonFile.content.version !== releaseVersion) {
    throw new Error(
      `Invalid version for ${packageJsonFile.relativePath}: expected ${releaseVersion}, got ${packageJsonFile.content.version}`
    )
  }
}
function checkPackageDependencyVersions(packageJsonFile: PackageJsonFile): void {
  if (packageJsonFile.content.private) {
    return
  }

  for (const dependencies of [
    packageJsonFile.content.dependencies,
    packageJsonFile.content.devDependencies,
    packageJsonFile.content.peerDependencies,
  ]) {
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (isBrowserSdkPackageName(dependencyName) && dependencyVersion !== releaseVersion) {
        throw new Error(
          `Invalid dependency version for ${dependencyName} in ${packageJsonFile.relativePath}: expected ${releaseVersion}, got ${dependencyVersion}`
        )
      }
    }
  }
}
function isBrowserSdkPackageName(name: string): boolean {
  return name?.startsWith('@datadog/')
}
