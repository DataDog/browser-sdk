import { browserSdkVersion as releaseVersion } from './browserSdkVersion.ts'
import { printLog } from './executionUtils.ts'
import type { PackageJsonInfo } from './filesUtils.ts'
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
function checkPackageJsonVersion(packageJsonInfo: PackageJsonInfo): void {
  if (packageJsonInfo.content.private) {
    // The developer extension is a private package, but it should still have a version
    if (
      packageJsonInfo.content.version &&
      packageJsonInfo.content.name !== '@datadog/browser-sdk-developer-extension'
    ) {
      throw new Error(`Private package ${packageJsonInfo.relativePath} should not have a version`)
    }
  } else if (packageJsonInfo.content.version !== releaseVersion) {
    throw new Error(
      `Invalid version for ${packageJsonInfo.relativePath}: expected ${releaseVersion}, got ${packageJsonInfo.content.version}`
    )
  }
}
function checkPackageDependencyVersions(packageJsonInfo: PackageJsonInfo): void {
  if (packageJsonInfo.content.private) {
    return
  }

  for (const dependencies of [
    packageJsonInfo.content.dependencies,
    packageJsonInfo.content.devDependencies,
    packageJsonInfo.content.peerDependencies,
  ]) {
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (isBrowserSdkPackageName(dependencyName) && dependencyVersion !== releaseVersion) {
        throw new Error(
          `Invalid dependency version for ${dependencyName} in ${packageJsonInfo.relativePath}: expected ${releaseVersion}, got ${dependencyVersion}`
        )
      }
    }
  }
}
function isBrowserSdkPackageName(name: string): boolean {
  return name?.startsWith('@datadog/')
}
